import dotenv from "dotenv";
dotenv.config();

import express from "express";
import connectToDatabase from './src/config/database.js';
import authRouter from "./src/routes/auth.route.js";
import cookieParser from "cookie-parser";
import cors from 'cors';

const PORT = process.env.PORT;
const app = express();

connectToDatabase();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

app.get('/', (req,res)=>{
    res.send("Welcome to server!!");
});

app.use('/api/auth', authRouter);

app.listen(PORT, ()=> {
    console.log(`server is live at port ${PORT}`);
});