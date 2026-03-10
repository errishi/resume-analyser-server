import mongoose from "mongoose";

const connectToDatabase = async() => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Database connected successfully...");
    } catch (error) {
        console.error("Fail to connect database ", error.message);
        process.exit(1);
    }
};

export default connectToDatabase;