import React from 'react';
import router from './app.routes.jsx';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './features/auth/auth.state.jsx';

const App = () => {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

export default App;