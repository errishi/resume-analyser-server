import jwt from 'jsonwebtoken';
import tokenBlacklistModel from '../models/blacklist.model.js';

export const authUser = async(req,res,next) => {
    const token = req.cookies.token;
    const secrectKey = process.env.JWT_SECRECT;

    const isBlacklisted = await tokenBlacklistModel.findOne({token});

    if(!token){
        return res.status(401).json({
            success: false,
            message: "Token not provided"
        });
    }
    
    if(isBlacklisted){
        return res.status(401).json({
            success: false,
            message: "Invalid user"
        });
    }

    try {
        const decoded = jwt.verify(token, secrectKey);
        req.user = decoded;
        next();
    } catch (error) {
        console.error(error);
        return res.status(401).json({
            success: false,
            message: "Invalid user"
        });
    }
}