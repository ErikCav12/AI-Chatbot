import Anthropic from "@anthropic-ai/sdk";

export const MAX_MESSAGES = 100

export interface Conversation {
    id: string;
    messages: Anthropic.MessageParam[];
    createdAt: number;
    title: string // auto-generated from user message
}

interface Storage {
    createConversation(): Conversation
    getConversation(conversationId: string): Conversation | null;
    getConversations(): Conversation[];
    addMessageToConversation(conversationId: string, message: Anthropic.MessageParam): Conversation | null;

}

export class InMemoryStorage implements Storage {
    private conversations: Record<string, Conversation> = {};

    createConversation(): Conversation {
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

    getConversation(conversationId: string): Conversation | null {
        const conversation = this.conversations[conversationId];
        
        return conversation ?? null // nullish operator returns left if not undefined then null is undefined
    }

    getConversations(): Conversation[] {
        return Object.values(this.conversations);
    }

    addMessageToConversation(conversationId: string, message: Anthropic.MessageParam): Conversation | null {
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
}

