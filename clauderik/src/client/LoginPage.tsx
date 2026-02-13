import { useState } from "react";
  import { useNavigate } from "react-router";
  import { authClient } from "./lib/auth";
  import { Button } from "@/components/ui/button";
  import genieIcon from "./assets/genie.svg";

  function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError("");
      setLoading(true);

      const action = isSignUp
        ? authClient.signUp.email({ email, password, name: email.split("@")[0] })
        : authClient.signIn.email({ email, password });

      const { error: authError } = await action;

      if (authError) {
        setError(authError.message ?? "Authentication failed");
        setLoading(false);
        return;
      }

      navigate("/new");
    }

    async function handleGoogle() {
      await authClient.signIn.social({ provider: "google", callbackURL: "/new" });
    }

    return (
      <div className="mx-auto max-w-[400px] min-h-screen flex flex-col items-center justify-center px-6">
        <img src={genieIcon} alt="Genie" className="w-[80px] h-[80px] drop-shadow-[0_0_8px_#d4a344] mb-4" />
        <h1 className="text-3xl font-extrabold tracking-tight mb-8">Gift Genie</h1>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-[#d4a344]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-[#d4a344]"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full bg-[#d4a344] hover:bg-[#b8892e] text-black font-semibold cursor-pointer">
            {loading ? "..." : isSignUp ? "Sign Up" : "Sign In"}
          </Button>
        </form>

        <button onClick={() => setIsSignUp(!isSignUp)} className="mt-3 text-sm text-white/50 hover:text-white/80 cursor-pointer">
          {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
        </button>

        <div className="w-full flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/20" />
          <span className="text-white/40 text-sm">or</span>
          <div className="flex-1 h-px bg-white/20" />
        </div>

        <Button onClick={handleGoogle} variant="outline" className="w-full cursor-pointer border-white/20 text-white hover:bg-white/5">
          Continue with Google
        </Button>
      </div>
    );
  }

  export default LoginPage;