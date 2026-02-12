import Anthropic from "@anthropic-ai/sdk";

export const MAX_MESSAGES = 100

export interface Conversation {
    id: string;
    messages: Anthropic.MessageParam[];
    createdAt: number;
    title: string // auto-generated from user message
}

interface Storage {
    createConversation(): Promise<Conversation>
    getConversation(conversationId: string): Promise<Conversation | null>;
    getConversations(): Promise<Conversation[]>;
    addMessageToConversation(conversationId: string, message: Anthropic.MessageParam): Promise<Conversation | null>;
    resetConversation(conversationId: string): Promise<boolean>;
}

export class InMemoryStorage implements Storage {
    private conversations: Record<string, Conversation> = {};

    async createConversation(): Promise<Conversation> {
        const id = crypto.randomUUID();

        const conversation: Conversation = {
            id,
            messages: [],
            createdAt: Date.now(),
            title: "New conversation",
        };

        this.conversations[id] = conversation

        return conversation
    }

    async getConversation(conversationId: string): Promise<Conversation | null> {
        const conversation = this.conversations[conversationId];
        
        return conversation ?? null // nullish operator returns left if not undefined then null is undefined
    }

    async getConversations(): Promise<Conversation[]> {
        return Object.values(this.conversations);
    }

    async addMessageToConversation(conversationId: string, message: Anthropic.MessageParam): Promise<Conversation | null> {
        const conversation = this.conversations[conversationId];
        if (!conversation) return null;

        conversation.messages.push(message);

        if (message.role === "user" && conversation.title === "New conversation") {
            const content = typeof message.content === "string"
            ? message.content: "";
            conversation.title = content.slice (0,50)
        }

        if (conversation.messages.length > MAX_MESSAGES) {
            conversation.messages = conversation.messages.slice(-MAX_MESSAGES)
        }

        return conversation
    }

    async resetConversation(conversationId: string): Promise<boolean> {
        const conversation = this.conversations[conversationId];
        if (!conversation) return false;

        conversation.messages = [];
        conversation.title = "New conversation";
        return true;
    }
}

