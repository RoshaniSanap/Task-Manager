const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const session = require("express-session");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(session({
    secret: process.env.SESSION_SECRET || "task_manager_secret",
    resave: false,
    saveUninitialized: false
}));

app.set("view engine", "ejs");

// MySQL connection
const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "task_manager"
});

// Check login
function checkLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }
    next();
}

// Home page
app.get("/", (req, res) => {
    if (req.session.user) {
        return res.redirect("/dashboard");
    }
    res.redirect("/login");
});

// Registration page
app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

// Register user
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.render("register", {
                error: "Please fill all fields."
            });
        }

        const [existing] = await db.execute(
            "SELECT id FROM users WHERE email = ?",
            [email]
        );

        if (existing.length > 0) {
            return res.render("register", {
                error: "Email already registered."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.execute(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [name, email, hashedPassword]
        );

        res.redirect("/login");

    } catch (error) {
        console.error(error);
        res.status(500).send("Registration failed.");
    }
});

// Login page
app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

// Login user
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const [users] = await db.execute(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.render("login", {
                error: "Invalid email or password."
            });
        }

        const user = users[0];

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.render("login", {
                error: "Invalid email or password."
            });
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email
        };

        res.redirect("/dashboard");

    } catch (error) {
        console.error(error);
        res.status(500).send("Login failed.");
    }
});

// Dashboard
app.get("/dashboard", checkLogin, async (req, res) => {
    try {
        const status = req.query.status || "all";

        let query = "SELECT * FROM tasks WHERE user_id = ?";
        const values = [req.session.user.id];

        if (status === "pending" || status === "completed") {
            query += " AND status = ?";
            values.push(status);
        }

        query += " ORDER BY deadline ASC";

        const [tasks] = await db.execute(query, values);

        res.render("dashboard", {
            user: req.session.user,
            tasks: tasks
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to load dashboard.");
    }
});

// Add task
app.post("/tasks", checkLogin, async (req, res) => {
    try {
        const { title, description, deadline } = req.body;

        if (!title || !deadline) {
            return res.status(400).send("Title and deadline are required.");
        }

        await db.execute(
            `INSERT INTO tasks
            (user_id, title, description, deadline, status)
            VALUES (?, ?, ?, ?, 'pending')`,
            [
                req.session.user.id,
                title,
                description || "",
                deadline
            ]
        );

        res.redirect("/dashboard");

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to add task.");
    }
});

// Update task status
app.post("/tasks/:id/status", checkLogin, async (req, res) => {
    try {
        const { status } = req.body;

        if (!["pending", "completed"].includes(status)) {
            return res.status(400).send("Invalid status.");
        }

        await db.execute(
            "UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?",
            [status, req.params.id, req.session.user.id]
        );

        res.redirect("/dashboard");

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to update task.");
    }
});

// Edit task page
app.get("/tasks/:id/edit", checkLogin, async (req, res) => {
    try {
        const [tasks] = await db.execute(
            "SELECT * FROM tasks WHERE id = ? AND user_id = ?",
            [req.params.id, req.session.user.id]
        );

        if (tasks.length === 0) {
            return res.status(404).send("Task not found.");
        }

        res.render("edit", { task: tasks[0] });

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to open task.");
    }
});

// Save edited task
app.post("/tasks/:id/edit", checkLogin, async (req, res) => {
    try {
        const { title, description, deadline } = req.body;

        await db.execute(
            `UPDATE tasks
             SET title = ?, description = ?, deadline = ?
             WHERE id = ? AND user_id = ?`,
            [
                title,
                description || "",
                deadline,
                req.params.id,
                req.session.user.id
            ]
        );

        res.redirect("/dashboard");

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to edit task.");
    }
});

// Delete task
app.post("/tasks/:id/delete", checkLogin, async (req, res) => {
    try {
        await db.execute(
            "DELETE FROM tasks WHERE id = ? AND user_id = ?",
            [req.params.id, req.session.user.id]
        );

        res.redirect("/dashboard");

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to delete task.");
    }
});

// Logout
app.post("/logout", checkLogin, (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Task Manager running at http://localhost:${PORT}`);
});