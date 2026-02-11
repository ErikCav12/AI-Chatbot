import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorage, MAX_MESSAGES } from "../src/server/storage";
import { SqliteStorage } from "../src/server/sqliteStorage";

// This is a test factory function — it takes a name and a function that creates a storage instance,
// then runs all 8 tests against that storage. This lets us reuse the exact same tests
// for both InMemoryStorage and SqliteStorage without duplicating any test code.
// When we add SupabaseStorage later, we just add another call to this function.
function runStorageTests(
    name: string,
    createStorage: () => InMemoryStorage | SqliteStorage
) {
    describe(name, () => {
        let storage: InMemoryStorage | SqliteStorage;

        // before each test, create a fresh storage instance
        // this ensures tests don't interfere with each other
        beforeEach(() => {
            storage = createStorage();
        });

        // test that creating a conversation returns a valid object
        // with a UUID string, empty messages array, default title, and a timestamp
        it("createConversation returns a conversation with a UUID and empty messages", async () => {
            const convo = await storage.createConversation();

            expect(convo.id).toBeTruthy();
            expect(typeof convo.id).toBe("string");
            expect(convo.messages).toEqual([]);
            expect(convo.title).toBe("New conversation");
            expect(typeof convo.createdAt).toBe("number");
            expect(convo.createdAt).toBeLessThanOrEqual(Date.now());
        });

        // test that we can retrieve a conversation we just created
        // and all fields match the original
        it("getConversation returns the correct conversation", async () => {
            const convo = await storage.createConversation();
            const retrieved = await storage.getConversation(convo.id);

            expect(retrieved).not.toBeNull();
            expect(retrieved!.id).toBe(convo.id);
            expect(retrieved!.title).toBe(convo.title);
            expect(retrieved!.createdAt).toBe(convo.createdAt);
            expect(retrieved!.messages).toEqual(convo.messages);
        });

        // test that looking up a conversation that was never created returns null
        it("getConversation returns null for unknown ID", async () => {
            const result = await storage.getConversation("nonexistent-id");

            expect(result).toBeNull();
        });

        // test that getConversations returns all conversations we've created
        it("getConversations returns all conversations", async () => {
            await storage.createConversation();
            await storage.createConversation();
            await storage.createConversation();

            const all = await storage.getConversations();
            expect(all.length).toBe(3);
        });

        // test that adding a message stores it correctly
        // with the right role and content
        it("addMessageToConversation appends messages correctly", async () => {
            const convo = await storage.createConversation();
            const result = await storage.addMessageToConversation(convo.id, {
                role: "user",
                content: "Hello genie",
            });

            expect(result).not.toBeNull();
            expect(result!.messages.length).toBe(1);
            expect(result!.messages[0].role).toBe("user");
            expect(result!.messages[0].content).toBe("Hello genie");
        });

        // test that adding a message to a non-existent conversation returns null
        it("addMessageToConversation returns null for unknown ID", async () => {
            const result = await storage.addMessageToConversation("fake-id", {
                role: "user",
                content: "Hello",
            });

            expect(result).toBeNull();
        });

        // test that the message history is capped at MAX_MESSAGES (100)
        // when we add more than the limit, the oldest messages should be dropped
        it("addMessageToConversation caps history at MAX_MESSAGES", async () => {
            const convo = await storage.createConversation();

            // add 110 messages (10 more than the limit)
            for (let i = 0; i < MAX_MESSAGES + 10; i++) {
                await storage.addMessageToConversation(convo.id, {
                    role: "user",
                    content: `Message ${i}`,
                });
            }

            const result = await storage.getConversation(convo.id);

            // should be capped at exactly MAX_MESSAGES
            expect(result!.messages.length).toBe(MAX_MESSAGES);
            // the first 10 messages (0-9) should have been dropped
            // so the oldest remaining message should be "Message 10"
            expect(result!.messages[0].content).toBe("Message 10");
        });

        // test that the conversation title is auto-set from the first user message
        // and doesn't change when subsequent messages are sent
        it("title is auto-generated from first user message", async () => {
            const convo = await storage.createConversation();

            // send a message longer than 50 chars to test truncation
            await storage.addMessageToConversation(convo.id, {
                role: "user",
                content: "I need a birthday gift for my wife who loves gardening",
            });

            const result = await storage.getConversation(convo.id);
            // title should be the first 50 characters of the message
            expect(result!.title).toBe("I need a birthday gift for my wife who loves garde");

            // send a second message — the title should NOT change
            await storage.addMessageToConversation(convo.id, {
                role: "user",
                content: "Something completely different",
            });

            const afterSecond = await storage.getConversation(convo.id);
            // title still matches the first message, not the second
            expect(afterSecond!.title).toBe("I need a birthday gift for my wife who loves garde");
        });
    });
}

// run all 8 tests against InMemoryStorage (original in-memory implementation)
runStorageTests("InMemoryStorage", () => new InMemoryStorage());

// run the same 8 tests against SqliteStorage using ":memory:" mode
// ":memory:" creates a temporary in-memory SQLite database that disappears after each test
// this avoids creating actual files on disk during testing
runStorageTests("SqliteStorage", () => new SqliteStorage(":memory:"));
