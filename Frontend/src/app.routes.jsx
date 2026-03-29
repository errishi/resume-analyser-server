import { createBrowserRouter } from 'react-router';
import Login from './features/auth/pages/Login';
import Register from './features/auth/pages/Register';
import { Navigate } from 'react-router';
import Protected from './features/auth/components/Protected';
import Home from './features/interview/pages/Home';

const router = createBrowserRouter([
    {
        path: "/login",
        element: <Login />
    },
    {
        path: "/register",
        element: <Register />
    },
    {
        path: "/",
        element: <Protected><Home /></Protected>
    }
]);

export default router;