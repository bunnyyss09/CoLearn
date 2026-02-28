import { useRecoilValue } from "recoil";
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { Navigate, useParams, useLocation } from "react-router-dom";

const ProtectedRouter = ({ children }: any) => {
  const user = useRecoilValue(userAtom);
  const auth = useRecoilValue(authAtom);
  const parms = useParams();
  const location = useLocation();

  // For dashboard routes, only require authentication (not room membership)
  if (location.pathname.startsWith('/dashboard')) {
    if (auth.isAuthenticated) {
      return children;
    }
    return <Navigate to={`/`} />;
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

  // Otherwise, send the user back to the root landing page.
  return <Navigate to={`/`} />;
};

export default ProtectedRouter;
