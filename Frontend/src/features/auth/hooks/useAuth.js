import { useContext } from "react"
import { AuthContext } from "../auth.state"
import { login, logout, register } from "../services/auth.api";

export const useAuth = () => {

    const context = useContext(AuthContext);
    const { user, setUser, loading, setLoading } = context;


    const handleLogin = async({email, password}) => {
        setLoading(true);
        try {
            const data = await login({email, password});
            setUser(data.user);
        } catch (err) {
            
        }finally{
            setLoading(false);
        }
    }

    const handleRegister = async({username, email, password}) => {
        setLoading(true);
        try {
            const data = await register({username, email, password});
            setUser(data.user);
        } catch (error) {
            
        }finally{
            setLoading(false);
        }
    }

    const handleLogout = async() => {
        setLoading(true);
        try {
            const data = await logout();
            setUser(null);
        } catch (err) {
            
        }finally{
            setLoading(false);
        }
    }

    return { user, loading, handleLogin, handleLogout, handleRegister };
}