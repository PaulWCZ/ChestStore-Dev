import type { ComponentType } from "react";
import type { Equipment, Feature } from "../lib/model.ts";
import { Accessible, Dock, Phone, Quiet, Screen, Standing, Video, Whiteboard, Window } from "./icons.tsx";

// The icons of a room's equipment and a desk's features (never alone: a
// word goes beside each).
export const equipmentIcons: Record<Equipment, ComponentType> = { screen: Screen, video: Video, whiteboard: Whiteboard, phone: Phone, accessible: Accessible };
export const featureIcons: Record<Feature, ComponentType> = { screen: Screen, dock: Dock, standing: Standing, window: Window, quiet: Quiet };
