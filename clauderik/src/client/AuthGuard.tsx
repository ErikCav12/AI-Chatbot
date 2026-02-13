import { Navigate, Outlet } from "react-router";
import { authClient } from "./lib/auth";

function AuthGuard() {
const { data: session, isPending } = authClient.useSession();

if (isPending) {
    return (
        <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/50">Loading...</p>
        </div>
    );
    }

    if (!session) return <Navigate to="/" replace />;

    return <Outlet />;
    }

export default AuthGuard;