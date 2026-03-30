import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:7000',
    withCredentials: true
});

export const register = async({username, email, password}) => {
    try {
        const response = await api.post(`/api/auth/register`, {
            username, email, password
        });

        return response.data;

    } catch (error) {
        console.error(error);
        throw error;
    }
}

export const login = async({email, password}) => {
    try {
        const response = await api.post(`/api/auth/login`, {
            email, password
        });

        return response.data;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

export const logout = async() => {
    try {
        const response = await api.get(`/api/auth/logout`);

        return response.data;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

export const getMe = async() => {
    try {
        const response = await api.get(`/api/auth/get-me`);

        return response.data;
    } catch (error) {
        console.error(error);
        throw error;
    }
}