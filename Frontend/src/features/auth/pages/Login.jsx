import React, { useState } from 'react'
import '../auth.form.scss';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import LoadingUI from '../../../components/LoadingUI';

const Login = () => {

  const navigate = useNavigate();
  const { handleLogin, loading } = useAuth();
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("");

  const handleSubmit = async(e) => {
    e.preventDefault();
    const success = await handleLogin({email, password});
    if (success) {
      navigate('/');
    }
  }

  if(loading){
    return(
      <LoadingUI
        title='Signing you in'
        subtitle='Verifying your credentials...'
      />
    )
  }

  return (
    <main>
      <div className='form-container'>
        <h1>Login</h1>
        <form onSubmit={handleSubmit}>

        <div className="input-group">
          <label htmlFor="email">Email</label>
          <input 
          onChange={(e)=>setEmail(e.target.value)}
          type="email" id='email' name='email' placeholder='Enter your email address' />
        </div>
        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input 
          onChange={(e)=>setPassword(e.target.value)}
          type="password" id='password' name='password' placeholder='Enter password' />
        </div>

        <button className='button primary-button'>Login</button>

        </form>

        <p>Don't have an account? &nbsp;
          <Link to={'/register'}>Create account</Link>
        </p>
      </div>
    </main>
  )
}

export default Login;