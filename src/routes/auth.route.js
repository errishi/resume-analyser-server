import express from "express";
import { userLogin, userLogout, userRegister } from "../controllers/auth.controller.js";
const authRouter = express.Router();

/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access public
 */

authRouter.post('/register', userRegister);

/**
 * @route POST /api/auth/login
 * @description login an existing user
 * @access public
 */

authRouter.post('/login', userLogin);

/**
 * @name GET /api/auth/logout
 * @description logout signin user
 * @access public
 */

authRouter.get('/logout', userLogout);

export default authRouter;