import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorage, MAX_MESSAGES } from "../src/server/storage";

describe("InMemoryStorage", () => {
    let storage: InMemoryStorage;

    beforeEach(() => {
        storage = new InMemoryStorage();
    });

    it("createConversation returns a conversation with a UUID and empty messages", () => {
        const convo = storage.createConversation();

        expect(convo.id).toBeTruthy();
        expect(typeof convo.id).toBe("string");
        expect(convo.messages).toEqual([]);
        expect(convo.title).toBe("New conversation");
        expect(typeof convo.createdAt).toBe("number");
        expect(convo.createdAt).toBeLessThanOrEqual(Date.now());
    })

    it("getConversation returns the correct conversation", () => {
        const convo = storage.createConversation();
        const retrieved = storage.getConversation(convo.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(convo.id);
        expect(retrieved!.title).toBe(convo.title);
        expect(retrieved!.createdAt).toBe(convo.createdAt);
        expect(retrieved!.messages).toEqual(convo.messages);

      });
  
      it("getConversation returns null for unknown ID", () => {

        const result = storage.getConversation("nonexistent-id");

        expect(result).toBeNull();
      });
  
      it("getConversations returns all conversations", () => {
        storage.createConversation();
        storage.createConversation();
        storage.createConversation();
        
        const all = storage.getConversations();
        expect(all.length).toBe(3);
      });
  
      it("addMessageToConversation appends messages correctly", () => {
        const convo = storage.createConversation();
        const result = storage.addMessageToConversation(convo.id, {
            role: "user",
            content: "Hello genie",
        });

        expect(result).not.toBeNull();
        expect(result!.messages.length).toBe(1);
        expect(result!.messages[0].role).toBe("user");
        expect(result!.messages[0].content).toBe("Hello genie");
      });
  
      it("addMessageToConversation returns null for unknown ID", () => {
        // TODO: try adding a message to a fake conversation ID
        // assert: result is null
        const result = storage.addMessageToConversation("fake-id", {
            role: "user",
            content: "Hello",
        });

        expect(result).toBeNull();
      });

      it("addMessageToConversation caps history at MAX_MESSAGES", () => {
        const convo = storage.createConversation();

        for (let i = 0; i < MAX_MESSAGES + 10; i++) {
            storage.addMessageToConversation(convo.id, {
                role: "user",
                content: `Message ${i}`,
            });
        }

        const result = storage.getConversation(convo.id);

        expect(result!.messages.length).toBe(MAX_MESSAGES)
        expect(result!.messages[0].content).toBe("Message 10");
      });
  
      it("title is auto-generated from first user message", () => {

        const convo = storage.createConversation();

        storage.addMessageToConversation(convo.id, {
          role: "user",
          content: "I need a birthday gift for my wife who loves gardening",
        });
    
        const result = storage.getConversation(convo.id);
        expect(result!.title).toBe("I need a birthday gift for my wife who loves garde");
    
        // second user message should NOT change the title
        storage.addMessageToConversation(convo.id, {
          role: "user",
          content: "Something completely different",
        });
    
        const afterSecond = storage.getConversation(convo.id);
        expect(afterSecond!.title).toBe("I need a birthday gift for my wife who loves garde");
      });
    });
