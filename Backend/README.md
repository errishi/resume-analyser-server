# GenAI Resume Analyzer - Backend

A robust Node.js/Express backend API for the GenAI Resume Analyzer platform. Integrates NVIDIA's advanced language models for intelligent resume analysis and interview preparation.

## 📚 Overview

This backend service provides:
- User authentication and authorization (JWT-based)
- Resume PDF parsing and analysis using AI
- Interview report generation with 78% average match accuracy
- Professional resume PDF generation with Puppeteer
- MongoDB persistence for user data and reports
- RESTful API endpoints with comprehensive error handling

## 🛠️ Tech Stack

- **Node.js** - JavaScript runtime
- **Express.js 5.2.1** - Web framework
- **MongoDB & Mongoose 9.2.4** - Database & ODM
- **OpenAI SDK 6.33.0** - API client (NVIDIA-compatible)
- **Zod 4.3.6** - Schema validation
- **Puppeteer 24.40.0** - PDF generation
- **bcrypt 6.0.0** - Password hashing
- **JWT 9.0.3** - Token authentication
- **Multer 2.1.1** - File upload handling
- **pdf-parse 2.4.5** - PDF parsing

## 📁 Directory Structure

```
src/
├── config/
│   └── database.js        # MongoDB connection setup
├── controllers/
│   ├── auth.controller.js        # Auth endpoint handlers
│   └── interview.controller.js   # Interview endpoint handlers
├── middlewares/
│   ├── auth.middleware.js        # JWT verification
│   └── file.middleware.js        # File upload configuration
├── models/
│   ├── user.model.js             # User database schema
│   ├── interviewReport.model.js  # Interview report schema
│   └── blacklist.model.js        # Token blacklist schema
├── routes/
│   ├── auth.route.js             # Auth routes
│   └── interview.route.js        # Interview routes
└── services/
    └── ai.service.js   # AI integration & resume processing

app.js                  # Express application setup
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16.x or higher
- npm or yarn
- MongoDB (local or MongoDB Atlas)
- NVIDIA API Key

### Installation

```bash
cd Backend
npm install
```

### Configuration

Create a `.env` file in the `Backend/` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/genai-resume-analyzer
# OR MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/genai-resume-analyzer

# NVIDIA API
NVIDIA_API_KEY=your_nvidia_api_key_here

# JWT
JWT_SECRET=your_secure_jwt_secret_key_minimum_32_characters
JWT_EXPIRY=7d

# CORS
CORS_ORIGIN=http://localhost:5173
```

### Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment mode | `development` or `production` |
| `MONGODB_URI` | Database connection string | `mongodb://localhost:27017/db` |
| `NVIDIA_API_KEY` | API key for NVIDIA | Obtained from [build.nvidia.com](https://build.nvidia.com) |
| `JWT_SECRET` | Secret for signing JWT tokens | Min 32 characters |
| `JWT_EXPIRY` | Token expiration time | `7d`, `24h`, etc. |
| `CORS_ORIGIN` | Frontend URL for CORS | `http://localhost:5173` |

### Development

```bash
npm run dev
# or
nodemon app.js
```

Server runs on `http://localhost:5000`

### Production

```bash
NODE_ENV=production node app.js
```

## 📡 API Endpoints

### Authentication Routes (`/api/auth`)

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

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "user_id_here",
    "email": "user@example.com",
    "name": "John Doe"
  }
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

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user_id_here",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Logout User
```http
POST /api/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

### Interview Routes (`/api/interview`)

#### Generate Interview Report
```http
POST /api/interview/generate-report
Content-Type: multipart/form-data
Authorization: Bearer {token}

Form Data:
- resumeFile: <PDF file>
- selfDescription: "My professional background and goals"
- jobDescription: "Senior Full Stack Developer - 5+ years experience"
```

**Response (200):**
```json
{
  "success": true,
  "message": "Interview report generated successfully",
  "interviewReport": {
    "_id": "report_id_here",
    "userId": "user_id_here",
    "resume": "Full resume text...",
    "selfDescription": "...",
    "jobDescription": "...",
    "matchScore": 78,
    "title": "Senior Full Stack Developer",
    "technicalQuestions": [
      {
        "question": "Explain the event loop in Node.js",
        "intention": "Assesses Node.js fundamentals",
        "answer": "The event loop handles async operations..."
      }
    ],
    "behavioralQuestions": [
      {
        "question": "Tell us about a time you resolved a conflict...",
        "intention": "Assesses teamwork and communication",
        "answer": "I communicated openly and found common ground..."
      }
    ],
    "skillGaps": [
      {
        "skill": "Kubernetes",
        "severity": "medium"
      }
    ],
    "preparationPlan": [
      {
        "day": 1,
        "focus": "Core Concepts",
        "tasks": ["Review async/await", "Explore promises"]
      }
    ],
    "createdAt": "2024-04-02T10:30:00Z"
  }
}
```

#### Get All Reports
```http
GET /api/interview/reports
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "reports": [
    { /* report objects */ }
  ]
}
```

#### Get Report by ID
```http
GET /api/interview/reports/:interviewId
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "interviewReport": { /* report object */ }
}
```

#### Download Resume PDF
```http
GET /api/interview/download-pdf/:interviewReportId
Authorization: Bearer {token}
```

**Response (200):** Binary PDF file

---

## 🤖 AI Integration

### NVIDIA Models
The service uses NVIDIA's OpenAI-compatible API with three language models in fallback order:

1. **meta/llama3-70b-instruct** - Primary (best performance)
2. **meta/llama3-8b-instruct** - Fallback 1
3. **nvidia/mistral-7b-instruct-v0.2** - Fallback 2

### Model Selection Strategy
```javascript
const MODEL_CANDIDATES = [
    "meta/llama3-70b-instruct",
    "meta/llama3-8b-instruct",
    "nvidia/mistral-7b-instruct-v0.2"
];
```

- Automatically tries next model on failure
- Implements exponential backoff for rate limiting
- Returns error only after all models fail

### API Configuration
```javascript
const ai = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1'
});
```

## 📊 Database Models

### User Schema
```javascript
{
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

### Interview Report Schema
```javascript
{
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resume: { type: String, required: true },
  selfDescription: { type: String },
  jobDescription: { type: String, required: true },
  matchScore: { type: Number, min: 0, max: 100 },
  title: { type: String },
  technicalQuestions: [
    {
      question: String,
      intention: String,
      answer: String
    }
  ],
  behavioralQuestions: [
    {
      question: String,
      intention: String,
      answer: String
    }
  ],
  skillGaps: [
    {
      skill: String,
      severity: { type: String, enum: ['low', 'medium', 'high'] }
    }
  ],
  preparationPlan: [
    {
      day: Number,
      focus: String,
      tasks: [String]
    }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

### Token Blacklist Schema
```javascript
{
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true }
}
```

## 🔒 Security Features

- ✅ **JWT Authentication** - Secure token-based auth
- ✅ **Password Hashing** - bcrypt with salt rounds
- ✅ **Token Blacklisting** - Logout invalidates tokens
- ✅ **Input Validation** - Zod schema validation
- ✅ **CORS Protection** - Whitelist frontend origin
- ✅ **HTML Escaping** - Prevent XSS in PDFs
- ✅ **File Upload Validation** - Only PDF files allowed

### Middleware Order
1. CORS validation
2. JSON parsing
3. Auth verification (for protected routes)
4. File upload handling
5. Route handler

## 📄 Resume PDF Generation

### Technology Stack
- **Puppeteer** - Headless Chrome for PDF rendering
- **Custom HTML templates** - Professional resume layouts
- **NVIDIA AI** - Content enrichment

### PDF Features
- **Professional Layout** - ATS-friendly formatting
- **Dynamic Content** - Supports various resume formats
- **AI Enhancement** - Uses AI to improve content quality
- **A4 Optimization** - Perfect page sizing
- **Font Support** - Calibri and system fonts

### Generation Pipeline
1. Parse resume text with AI
2. Extract structured data (name, experience, skills, etc.)
3. Enrich content with AI (improve descriptions)
4. Generate HTML from enriched data
5. Convert HTML to PDF using Puppeteer
6. Return as downloadable file

## 🔄 Request/Response Flow

### Example: Generate Interview Report
```
1. Client uploads resume PDF + form data
2. Multer validates & stores file temporarily
3. pdf-parse extracts text from PDF
4. AI service generates structured data
5. AI service generates interview questions
6. MongoDB stores report
7. Response sent with report data
8. Temp file cleaned up
```

## 🆘 Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": "Error message here",
  "status": 400
}
```

### Common HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `500` - Server error

## 📈 Performance Optimization

- **Database Indexing** - Indexed queries on userId, email
- **Streaming Responses** - OpenAI streaming reduces latency
- **Connection Pooling** - MongoDB connection reuse
- **Error Recovery** - Automatic model fallbacks
- **Rate Limiting** - Exponential backoff handling

## 🧪 Testing

Add testing dependencies:
```bash
npm install --save-dev jest supertest
```

Run tests:
```bash
npm test
```

## 🆘 Troubleshooting

### MongoDB Connection Issues
```bash
# Test connection string
mongosh "mongodb://localhost:27017"

# For Atlas, ensure IP whitelist includes your IP
```

### NVIDIA API Errors
- Verify API key in `.env`
- Check API usage limits
- Ensure internet connectivity
- Review API documentation at [build.nvidia.com](https://build.nvidia.com)

### PDF Generation Issues
- Check system RAM and disk space
- Verify Puppeteer installation: `npm rebuild puppeteer`
- Increase Node.js heap size: `node --max-old-space-size=4096 app.js`

### JWT Token Issues
```javascript
// Clear old tokens
await Blacklist.deleteMany({ expiresAt: { $lt: new Date() } });
```

## 📚 Dependencies Overview

| Package | Version | Purpose |
|---------|---------|---------|
| express | 5.2.1 | Web framework |
| mongoose | 9.2.4 | MongoDB ODM |
| openai | 6.33.0 | API client |
| puppeteer | 24.40.0 | PDF generation |
| zod | 4.3.6 | Validation |
| bcrypt | 6.0.0 | Password hashing |
| jsonwebtoken | 9.0.3 | JWT tokens |
| multer | 2.1.1 | File uploads |
| pdf-parse | 2.4.5 | PDF parsing |
| dotenv | 17.3.1 | Env vars |

## 🔗 Related Files

- Main README: [../README.md](../README.md)
- Frontend: [../Frontend/README.md](../Frontend/README.md)
- Implementation Status: [../IMPLEMENTATION_COMPLETE.md](../IMPLEMENTATION_COMPLETE.md)

## 📄 License

ISC License - see main README.md

---

**Last Updated:** April 2, 2026

**Author:** Rishikesh Singh
