import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { Conversation, MAX_MESSAGES } from "./storage.js";

// SupabaseStorage implements the same Storage interface as InMemoryStorage and SqliteStorage,
// but stores data in a cloud PostgreSQL database via Supabase.
// This means conversations persist across server restarts AND across different machines —
// useful for production deployments where the server might move or scale.

export class SupabaseStorage {
    // the Supabase client instance — all queries go through this
    private supabase: SupabaseClient;

    constructor() {
        // read the Supabase connection details from environment variables
        // these are set in the .env file (SUPABASE_URL and SUPABASE_ANON_KEY)
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_ANON_KEY;

        // if either value is missing, throw an error immediately
        // this prevents confusing errors later when trying to make queries
        if (!url || !key) {
            throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env");
        }

        // create the Supabase client — this doesn't make a network request yet,
        // it just sets up the client with the URL and API key for future queries
        this.supabase = createClient(url, key);
    }

    // creates a new conversation with a unique ID and default title
    // returns the conversation object with an empty messages array
    async createConversation(): Promise<Conversation> {
        // generate a unique ID and timestamp on our side (same as other implementations)
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        const title = "New conversation";

        // insert a new row into the conversations table in Supabase
        // .select().single() tells Supabase to return the inserted row back to us
        const { error } = await this.supabase
            .from("conversations")
            .insert({ id, title, created_at: createdAt });

        // if the insert failed, throw an error so the route handler can catch it
        if (error) throw new Error(`Failed to create conversation: ${error.message}`);

        // return the conversation object in the same shape as the interface expects
        return {
            id,
            messages: [],
            createdAt,
            title,
        };
    }

    // looks up a conversation by its ID
    // returns the full conversation with all its messages, or null if not found
    async getConversation(conversationId: string): Promise<Conversation | null> {
        // query the conversations table for a row matching this ID
        // .single() tells Supabase we expect exactly one row (or none)
        const { data: row, error } = await this.supabase
            .from("conversations")
            .select("*")
            .eq("id", conversationId)
            .single();

        // if no row was found, the conversation doesn't exist
        // Supabase returns an error with code PGRST116 when .single() finds no rows
        if (error || !row) return null;

        // fetch all messages for this conversation, ordered chronologically
        // this gives us the full chat history in the order it happened
        const { data: messageRows, error: msgError } = await this.supabase
            .from("messages")
            .select("role, content")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });

        // if the message query failed, throw an error
        if (msgError) throw new Error(`Failed to fetch messages: ${msgError.message}`);

        // convert the database rows into Anthropic.MessageParam format
        // each row has a role ("user" or "assistant") and the text content
        const messages: Anthropic.MessageParam[] = (messageRows || []).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
        }));

        // build and return the full Conversation object
        return {
            id: row.id,
            messages,
            createdAt: row.created_at,
            title: row.title,
        };
    }

    // returns all conversations with their messages
    // used to populate the sidebar list in the UI
    async getConversations(): Promise<Conversation[]> {
        // fetch all conversation rows from Supabase
        const { data: rows, error } = await this.supabase
            .from("conversations")
            .select("*");

        // if the query failed, throw an error
        if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);

        // for each conversation, fetch its messages and build the full object
        // we reuse getConversation() to avoid duplicating the message-fetching logic
        const conversations: Conversation[] = [];
        for (const row of rows || []) {
            const convo = await this.getConversation(row.id);
            // safety check — should always exist since we just got the row
            if (convo) conversations.push(convo);
        }

        return conversations;
    }

    // adds a message to an existing conversation
    // handles auto-titling from the first user message and enforces the message cap
    // returns the updated conversation, or null if the conversation doesn't exist
    async addMessageToConversation(
        conversationId: string,
        message: Anthropic.MessageParam
    ): Promise<Conversation | null> {
        // first check if the conversation exists
        const { data: row, error: findError } = await this.supabase
            .from("conversations")
            .select("id, title")
            .eq("id", conversationId)
            .single();

        // if the conversation doesn't exist, return null (route handler will send 404)
        if (findError || !row) return null;

        // extract the message content as a string
        // message.content can be a string or an array of content blocks (Anthropic SDK types)
        // our app only sends strings, but the type guard keeps TypeScript happy
        const content = typeof message.content === "string"
            ? message.content
            : "";

        // insert the new message into the messages table
        const { error: insertError } = await this.supabase
            .from("messages")
            .insert({
                conversation_id: conversationId,
                role: message.role,
                content,
                created_at: Date.now(),
            });

        // if the insert failed, throw an error
        if (insertError) throw new Error(`Failed to insert message: ${insertError.message}`);

        // auto-title: if this is a user message and the conversation still has the default title,
        // update the title to the first 50 characters of the message
        // the .eq("title", "New conversation") ensures this only happens once
        if (message.role === "user" && row.title === "New conversation") {
            await this.supabase
                .from("conversations")
                .update({ title: content.slice(0, 50) })
                .eq("id", conversationId);
        }

        // enforce the MAX_MESSAGES cap — count how many messages this conversation has
        const { count, error: countError } = await this.supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conversationId);

        if (countError) throw new Error(`Failed to count messages: ${countError.message}`);

        // if there are too many messages, delete the oldest ones
        if (count && count > MAX_MESSAGES) {
            // calculate how many messages we need to remove
            const excess = count - MAX_MESSAGES;

            // fetch the IDs of the oldest messages that need to be deleted
            const { data: oldMessages } = await this.supabase
                .from("messages")
                .select("id")
                .eq("conversation_id", conversationId)
                .order("created_at", { ascending: true })
                .limit(excess);

            // delete those oldest messages by their IDs
            if (oldMessages && oldMessages.length > 0) {
                const idsToDelete = oldMessages.map((m) => m.id);
                await this.supabase
                    .from("messages")
                    .delete()
                    .in("id", idsToDelete);
            }
        }

        // return the full updated conversation by re-fetching it from Supabase
        // this ensures the returned object always reflects the current state
        return this.getConversation(conversationId);
    }

    // deletes all messages for a conversation and resets its title
    // returns true if the conversation existed, false otherwise
    async resetConversation(conversationId: string): Promise<boolean> {
        // check if the conversation exists
        const { data: row, error } = await this.supabase
            .from("conversations")
            .select("id")
            .eq("id", conversationId)
            .single();

        // if the conversation doesn't exist, return false
        if (error || !row) return false;

        // delete all messages belonging to this conversation
        await this.supabase
            .from("messages")
            .delete()
            .eq("conversation_id", conversationId);

        // reset the title back to the default
        await this.supabase
            .from("conversations")
            .update({ title: "New conversation" })
            .eq("id", conversationId);

        return true;
    }
}
