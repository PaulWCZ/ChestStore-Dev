import { serve } from "@argentic/chest-app";
import { app } from "./app.tsx";

// The Chest starts this (npm start) and relays its requests to PORT.
serve(app);
