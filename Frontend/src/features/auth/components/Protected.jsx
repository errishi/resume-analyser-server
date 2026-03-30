import React from 'react'
import { useAuth } from '../hooks/useAuth.js';
import { Navigate } from 'react-router';
import LoadingUI from '../../../components/LoadingUI.jsx';

const Protected = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <LoadingUI
                title='Please wait...'
            />
        )
    }

    if (!user) {
        return <Navigate to={'/login'} />
    }

    return (
        children
    )
}

export default Protected;