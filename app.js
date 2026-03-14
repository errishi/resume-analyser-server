import dotenv from "dotenv";
dotenv.config();

import express from "express";
import connectToDatabase from './src/config/database.js';
import authRouter from "./src/routes/auth.route.js";

const PORT = process.env.PORT;
const app = express();

connectToDatabase();

app.use(express.json());

app.get('/', (req,res)=>{
    res.send("Welcome to server!!");
});

app.use('/api/auth', authRouter);

app.listen(PORT, ()=> {
    console.log(`server is live at port ${PORT}`);
});