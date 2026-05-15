import { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { Navigate, useParams, useLocation } from "react-router-dom";

const ProtectedRouter = ({ children }: any) => {
  const user = useRecoilValue(userAtom);
  const [auth, setAuth] = useRecoilState(authAtom);
  const parms = useParams();
  const location = useLocation();
  const [hydratedAuth, setHydratedAuth] = useState(false);

  useEffect(() => {
    if (auth.isAuthenticated) {
      setHydratedAuth(true);
      return;
    }

    const token = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("user");
    if (token && storedUser) {
      try {
        setAuth({
          isAuthenticated: true,
          user: JSON.parse(storedUser),
          token,
        });
      } catch {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
      }
    }
    setHydratedAuth(true);
  }, [auth.isAuthenticated, setAuth]);

  if (!hydratedAuth) {
    return null;
  }

  // For dashboard routes, only require authentication (not room membership)
  if (location.pathname.startsWith('/dashboard')) {
    if (auth.isAuthenticated) {
      return children;
    }
    return <Navigate to={`/start`} />;
  }

  // For routes that already include a roomId in the URL (like /code/:roomId
  // or /learn/:roomId), allow direct access. The page components themselves
  // handle joining/initialization flows.
  if (parms.roomId) {
    return children;
  }

  const hasUser = user.id !== "" && user.roomId !== "";
  if (hasUser) {
    return children;
  }

  // Otherwise, send the user back to the room entry page.
  return <Navigate to={`/start`} />;
};

export default ProtectedRouter;
