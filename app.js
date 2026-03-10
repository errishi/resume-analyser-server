import dotenv from "dotenv";
dotenv.config();

import express from "express";
import connectToDatabase from './src/config/database.js';

const PORT = process.env.PORT;
const app = express();

connectToDatabase();

app.get('/', (req,res)=>{
    res.send("Welcome to server!!");
});

app.listen(PORT, ()=> {
    console.log(`server is live at port ${PORT}`);
});