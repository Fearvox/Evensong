import type { Capsule } from "../types";

export const validCapsule: Capsule = {
  id: "cap-001",
  title: "Test Storyboard",
  canvas: { width: 1280, height: 720 },
  scenes: [
    {
      id: "scene-1",
      index: 0,
      duration: 2000,
      caption: "Opening scene",
      overlay: "ACT I",
      transition: "fade",
      background: "#1a1a2e",
      elements: [
        {
          type: "text",
          x: 540,
          y: 320,
          width: 200,
          height: 40,
          content: "Hello, world",
          style: { "font-size": "24px", color: "#fff" },
        },
        {
          type: "shape",
          x: 100,
          y: 100,
          width: 160,
          height: 120,
        },
        {
          type: "placeholder",
          x: 900,
          y: 500,
          width: 300,
          height: 200,
          content: "Image TBD",
        },
      ],
    },
    {
      id: "scene-2",
      index: 1,
      duration: 3500,
      caption: "Closing scene",
      transition: "zoom",
      background: "#16213e",
      elements: [
        {
          type: "text",
          x: 440,
          y: 340,
          width: 400,
          height: 40,
          content: "The End",
          style: { "font-size": "32px" },
        },
      ],
    },
  ],
  metadata: { author: "test-suite" },
};
