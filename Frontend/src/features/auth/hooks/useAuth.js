import { useContext, useEffect } from "react"
import { AuthContext } from "../auth.context.jsx"
import { getMe, login, logout, register } from "../services/auth.api";
import { toast } from "react-toastify";

function getErrorMessage(error, fallbackMessage) {
    return error?.response?.data?.message || fallbackMessage;
}

export const useAuth = () => {

    const context = useContext(AuthContext);
    const { user, setUser, loading, setLoading } = context;


    const handleLogin = async ({ email, password }) => {
        setLoading(true);
        try {
            const data = await login({ email, password });
            setUser(data.user);
            toast.success("Logged in successfully");
            return true;
        } catch (err) {
            toast.error(getErrorMessage(err, "Login failed"));
            return false;
        } finally {
            setLoading(false);
        }
    }

    const handleRegister = async ({ username, email, password }) => {
        setLoading(true);
        try {
            const data = await register({ username, email, password });
            setUser(data.user);
            toast.success("Account created successfully");
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, "Registration failed"));
            return false;
        } finally {
            setLoading(false);
        }
    }

    const handleLogout = async () => {
        setLoading(true);
        try {
            await logout();
            setUser(null);
            toast.success("Logged out successfully");
            return true;
        } catch (err) {
            toast.error(getErrorMessage(err, "Logout failed"));
            return false;
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {

        const getAndSetUser = async () => {
            try {
                const data = await getMe();
                setUser(data.user);
            } catch (error) {
                console.error(error);
            }finally{
                setLoading(false);
            }
        }

        getAndSetUser();

    }, []);

    return { user, loading, handleLogin, handleLogout, handleRegister };
}