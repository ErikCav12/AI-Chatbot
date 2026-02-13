import "./App.css";                                                                                                                                                     
                                                                                                                                                                        
import { useState, useEffect } from "react";                                                                                                                            
import { Outlet, useNavigate, useParams } from "react-router";                                                                                                          

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Menu } from "lucide-react";
import { authClient } from "./lib/auth";
import { LogOut } from "lucide-react";

import genieIcon from "./assets/genie.svg";

function App() {
  const [conversationList, setConversationList] = useState<{id: string, title: string, createdAt: number}[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { chatId } = useParams();

  // load the conversation list when the app first opens
  useEffect(() => {
    fetchConversations();
  }, []);

  // fetch all conversations from the server to populate the sidebar
  async function fetchConversations() {
    const res = await fetch("/conversations");
    if (!res.ok) return;
    const data = await res.json();
    setConversationList(data);
  }

  function createNewConversation() {
    navigate("/new");
    setDrawerOpen(false);
  }

  function selectConversation(id: string) {
    navigate(`/chat/${id}`);
    setDrawerOpen(false);
  }

  async function handleLogout() {
    await authClient.signOut();
    navigate("/");
  }

  return (
    <div className="mx-auto max-w-[800px] h-screen flex flex-col px-6 py-6 overflow-hidden">
      {/* Header */}
      <header className="text-center animate-fade-in-down">
        <div className="flex items-center justify-center gap-4 relative">
          {/* Menu button to open the sidebar drawer */}
          <Drawer direction="left" open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="absolute left-0 cursor-pointer"
              >
                <Menu className="w-6 h-6" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="h-full w-[300px] rounded-none">
              <DrawerHeader>
                <DrawerTitle>Conversations</DrawerTitle>
              </DrawerHeader>
              <div className="p-4 flex flex-col gap-2">
                {/* New conversation button */}
                <Button onClick={createNewConversation} className="w-full cursor-pointer">
                  New Conversation
                </Button>
                <Separator className="my-2" />
                {/* List of existing conversations */}
                <div className="flex flex-col gap-1 overflow-y-auto">
                  {conversationList.map((convo) => (
                    <Button
                      key={convo.id}
                      variant={convo.id === chatId ? "secondary" : "ghost"}
                      className="justify-start text-left text-sm truncate cursor-pointer"
                      onClick={() => selectConversation(convo.id)}
                    >
                      {convo.title}
                    </Button>
                  ))}
                </div>
              </div>
            </DrawerContent>
          </Drawer>

          <Button variant="ghost" size="sm" onClick={handleLogout} className="absolute right-0 cursor-pointer text-white/50 hover:text-white">
          <LogOut className="w-5 h-5" />
          </Button>

          <img
            src={genieIcon}
            alt="Genie"
            className="w-[60px] h-[60px] drop-shadow-[0_0_8px_#d4a344]"
          />
          <h1 className="text-[clamp(2rem,5vw,2.5rem)] font-extrabold tracking-tight">
            Gift Genie
          </h1>
        </div>
      </header>

      <div className="h-6" />

      {/* Child route renders here (ChatView) */}
      <main className="flex-1 min-h-0">
        <Outlet context={{ fetchConversations }} />
      </main>
    </div>
  );
}

export default App;