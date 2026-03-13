import userModel from '../models/user.model.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

/**
 * @name userRegisterController
 * @description register a new user, expects username, email and password in the request body.
 * @access public
 */

export const userRegister = async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || password) {
        return res.status(400).json({
            success: false,
            message: "Please provide username, email and password"
        });
    }

    const isUserAlreadyExist = await userModel.findOne({
        $or: [{ username }, { email }]
    });

    if (isUserAlreadyExist) {
        return res.status(400).json({
            success: false,
            message: "Account already exists with this email or username"
        });
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const createUser = await userModel.create({
        username,
        email,
        password: hashPassword
    });

    const secrectKey = process.env.JWT_SECRECT;

    const token = jwt.sign(
        { id: createUser._id, username: username },
        secrectKey,
        { expiresIn: '1d' }
    );

    res.cookie("token", token);

    res.status(201).json({
        success: true,
        message: "Account created successfully!🎉",
        user: {
            id: createUser._id,
            username: createUser.username,
            email: createUser.email,
        }
    });
}

/**
 * @name userLoginController
 * @description login user, expects email and password in the request body.
 * @access public
 */

export const userLogin = async (req, res) => {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });

    if (!user) {
        return res.status(400).json({
            success: false,
            message: "Invalid email or password."
        });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return res.status(400).json({
            success: false,
            message: "Something went wrong."
        });
    }

    const token = jwt.sign(
        { id: user._id, username: username },
        secrectKey,
        { expiresIn: '1d' }
    );

    res.cookie("token", token);
    res.status(200).json({
        success: true,
        message: "User loggedIn successfully. 🎉",
        user: {
            id: user._id,
            email: user.email,
            username: user.username
        }
    });
}
