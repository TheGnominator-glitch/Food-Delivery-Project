// Loads .env.local for scripts that use lib/ code. Import it first: import "./env";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });