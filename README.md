# GenAI Resume Analyzer

A cutting-edge AI-powered resume analysis and interview preparation platform built with the MERN stack. Leverages NVIDIA's advanced language models to generate personalized interview reports and professionally formatted resume PDFs.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-ISC-green)
![MERN Stack](https://img.shields.io/badge/stack-MERN-green)

---

## 🎯 Features

### Core Functionality
- **AI-Powered Resume Analysis** - Uses NVIDIA's Llama 3 models to intelligently parse and extract resume information
- **Interview Report Generation** - Creates comprehensive interview preparation reports with:
  - Job match scoring (0-100)
  - Technical interview questions with answers
  - Behavioral interview questions with answers
  - Identified skill gaps with severity levels
  - 3-day preparation plan
  
- **Professional Resume PDF Generation** - Generates beautifully formatted, ATS-friendly resume PDFs using Puppeteer
- **AI Content Enrichment** - Enhances resume content while preserving original user data
- **Secure Authentication** - JWT-based user authentication with password encryption (bcrypt)
- **File Upload Management** - Upload and parse PDF resumes using Multer and pdf-parse

### Advanced Features
- **Multi-Model Fallback System** - Automatically switches between NVIDIA models if primary fails
- **Retry Logic with Exponential Backoff** - Handles API rate limiting gracefully
- **Schema Validation** - Uses Zod for robust data validation and type safety
- **Real-time Response Streaming** - OpenAI-compatible streaming for fast response times
- **Auto-Download PDFs** - Seamless PDF download to user's device

---

## 🏗️ Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 5.2.1
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken)
- **AI Models**: NVIDIA API (OpenAI-compatible)
- **PDF Generation**: Puppeteer 24.40.0
- **PDF Parsing**: pdf-parse 2.4.5
- **Validation**: Zod 4.3.6
- **Security**: bcrypt 6.0.0

### Frontend
- **Framework**: React 19.2.4
- **Build Tool**: Vite 8.0.0
- **Routing**: React Router 7.13.2
- **HTTP Client**: Axios 1.13.6
- **Notifications**: react-toastify 11.0.5
- **Styling**: SCSS/SASS 1.98.0
- **Linting**: ESLint 9.39.4

---

## 📁 Project Structure

```
GenAi-resume-analyser/
├── Backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   └── interview.controller.js
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js
│   │   │   └── file.middleware.js
│   │   ├── models/
│   │   │   ├── user.model.js
│   │   │   ├── blacklist.model.js
│   │   │   └── interviewReport.model.js
│   │   ├── routes/
│   │   │   ├── auth.route.js
│   │   │   └── interview.route.js
│   │   └── services/
│   │       └── ai.service.js
│   ├── app.js
│   ├── package.json
│   └── .env
│
├── Frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── LoadingUI.jsx
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   ├── pages/ (Login, Register)
│   │   │   │   └── services/
│   │   │   └── interview/
│   │   │       ├── hooks/
│   │   │       ├── pages/ (Home, Interview)
│   │   │       ├── services/
│   │   │       └── styles/
│   │   ├── styles/
│   │   ├── App.jsx
│   │   ├── app.routes.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── IMPLEMENTATION_COMPLETE.md
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16.x or higher
- npm or yarn
- MongoDB (local or cloud instance)
- NVIDIA API Key (sign up at [API Sandbox](https://build.nvidia.com/))

### Installation

#### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/GenAi-resume-analyser.git
cd GenAi-resume-analyser
```

#### 2. Backend Setup
```bash
cd Backend
npm install
```

#### 3. Frontend Setup
```bash
cd ../Frontend
npm install
```

---

## ⚙️ Configuration

### Backend Environment Variables
Create a `.env` file in the `Backend/` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/genai-resume-analyzer
# OR use MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/genai-resume-analyzer

# NVIDIA API
NVIDIA_API_KEY=your_nvidia_api_key_here

# JWT
JWT_SECRET=your_secure_jwt_secret_key
JWT_EXPIRY=7d

# CORS
CORS_ORIGIN=http://localhost:5173
```

### Frontend Environment Variables
Create a `.env` file in the `Frontend/` directory:

```env
VITE_API_URL=http://localhost:5000
```

---

## 🏃 Running the Application

### Development Mode

#### Terminal 1 - Backend Server
```bash
cd Backend
npm run dev
# or
nodemon app.js
```

#### Terminal 2 - Frontend Dev Server
```bash
cd Frontend
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

### Production Mode

#### Build Frontend
```bash
cd Frontend
npm run build
```

#### Run Backend (Production)
```bash
cd Backend
NODE_ENV=production node app.js
```

---

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Logout User
```http
POST /api/auth/logout
Authorization: Bearer {token}
```

---

### Interview Endpoints

#### Generate Interview Report
```http
POST /api/interview/generate-report
Content-Type: multipart/form-data
Authorization: Bearer {token}

Parameters:
- resumeFile: PDF file (form data)
- selfDescription: string
- jobDescription: string
```

**Response:**
```json
{
  "success": true,
  "interviewReport": {
    "_id": "report_id",
    "matchScore": 78,
    "title": "Senior Full Stack Developer",
    "technicalQuestions": [...],
    "behavioralQuestions": [...],
    "skillGaps": [...],
    "preparationPlan": [...]
  }
}
```

#### Get All Interview Reports
```http
GET /api/interview/reports
Authorization: Bearer {token}
```

#### Get Report by ID
```http
GET /api/interview/reports/:interviewId
Authorization: Bearer {token}
```

#### Download Resume PDF
```http
GET /api/interview/download-pdf/:interviewReportId
Authorization: Bearer {token}
```

**Returns:** PDF file (binary)

---

## 🤖 AI Models Used

### NVIDIA Models (in priority order)
1. **meta/llama3-70b-instruct** - Primary model, best at JSON generation
2. **meta/llama3-8b-instruct** - Fallback alternative
3. **nvidia/mistral-7b-instruct-v0.2** - Last resort fallback

### Model Selection Strategy
- Automatically switches models if API returns errors
- Implements exponential backoff for rate limiting
- Falls back gracefully if all models fail

---

## 📊 Database Models

### User Model
```javascript
{
  email: String (unique),
  password: String (hashed),
  name: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Interview Report Model
```javascript
{
  userId: ObjectId (ref: User),
  resume: String,
  selfDescription: String,
  jobDescription: String,
  matchScore: Number (0-100),
  title: String,
  technicalQuestions: Array,
  behavioralQuestions: Array,
  skillGaps: Array,
  preparationPlan: Array,
  createdAt: Date,
  updatedAt: Date
}
```

### Blacklist Model
```javascript
{
  token: String (unique),
  expiresAt: Date
}
```

---

## 🔒 Security Features

- ✅ JWT Token-based Authentication
- ✅ Password Encryption (bcrypt)
- ✅ Token Blacklisting on Logout
- ✅ CORS Protection
- ✅ Input Validation (Zod)
- ✅ HTML Escaping in PDF Generation
- ✅ Secure File Upload Handling

---

## 📝 Resume PDF Generation

### Features
- **Professional Layout** - ATS-friendly format matching industry standards
- **Calibri Font** - Professional typography optimized for readability
- **Responsive Sections** - PROFESSIONAL SUMMARY, EXPERIENCE, EDUCATION, TECHNICAL SKILLS, PROJECTS
- **AI Enhancement** - Content improved using NVIDIA AI while preserving original data
- **Link Support** - LinkedIn and GitHub URLs in header
- **A4 Optimized** - Perfect page fit with optimized spacing

### Font Sizes
- Name: 24px
- Job Title: 11px
- Contact Info: 9px
- Section Headers: 11px
- Body Text: 10px
- Details: 9px

---

## 🧪 Testing

Currently no automated tests. To add testing:

```bash
npm install --save-dev jest supertest
```

---

## 🆘 Troubleshooting

### Common Issues

#### NVIDIA API Errors
- Check API key validity in `.env`
- Verify API usage limits on NVIDIA dashboard
- Check network connectivity

#### MongoDB Connection Issues
- Ensure MongoDB service is running
- Verify connection string in `.env`
- Check firewall settings for cloud MongoDB

#### PDF Generation Issues
- Ensure Puppeteer dependencies are installed
- Check system RAM (Puppeteer requires ~150MB per instance)
- Verify file permissions

#### CORS Errors
- Update `CORS_ORIGIN` in `.env` to match frontend URL
- Ensure backend is running on correct port

---

## 📈 Performance Optimization

- **Streaming Responses** - OpenAI-compatible streaming reduces latency
- **Model Fallback** - Automatic switching improves reliability
- **Retry Logic** - Exponential backoff prevents API strain
- **Database Indexing** - Indexed queries for faster lookups

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style
- Use ESLint for JavaScript
- Follow existing folder structure
- Add comments for complex logic

---

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Rishikesh Singh**

- GitHub: [@errishi](https://github.com/errishi)

---

## 🙏 Acknowledgments

- [NVIDIA API](https://build.nvidia.com/) - AI models and infrastructure
- [OpenAI](https://openai.com/) - SDK and API compatibility
- [MongoDB](https://www.mongodb.com/) - Database solution
- [Puppeteer](https://pptr.dev/) - PDF generation library

---

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact the author directly
- Check existing documentation

---

**Last Updated:** April 2, 2026

