# ScreenCap – Premium Screenshot Capture & Editor

ScreenCap is a powerful, lightweight Chrome extension designed for high-quality screen captures followed by instant, precision-based editing. Built with a focus on modern design and user efficiency, it provides a seamless workflow from capture to annotation.

Developed by **Parag Dhali**.

---

## ✨ Key Features

### 📸 Pro Capture
- **Instant Screenshot**: Capture your current tab with a single click.
- **High Resolution**: High-fidelity captures ensuring clarity for documentation or sharing.
- **Smart Context**: Preserves the original tab's dimensions and clarity.

### 🎨 Advanced Editing Suite
A full-featured toolbar with glassmorphism aesthetics and precise controls:
- **Undo & Redo**: Fully non-destructive workflow with deep history tracking.
- **Select Tool**: Manipulate, resize, and move objects on the canvas with intuitive handles.
- **Pen & Eraser**: Fluid freehand drawing and precision element removal.
- **Shapes**:
  - **Line & Arrow**: Perfect for highlighting directions or connections.
  - **Rectangle & Circle/Oval**: Clean geometric annotations with advanced styling.
- **Rich Text Tool**: 
  - Dynamic in-place editing.
  - Variety of fonts (Inter, Arial, Georgia, Monospace).
  - Advanced styling: **Bold**, *Italic*, and <u>Underline</u>.
  - Granular font sizing and real-time preview.
- **Layer Management System**:
  - **Dynamic Layer List**: View all shapes and text with unique, automatically generated names.
  - **Drag-and-Drop Reordering**: Change the Z-index of elements by simply reordering them in the sidebar.
  - **In-place Renaming**: **Double-click** any layer item to rename it for better organization.
  - **Quick Selection & Deletion**: Instantly select or remove any object directly from the layers panel index.

### ⚙️ Precision Controls
- **Smart Sizing**: Adjustable line thickness from 1px to 20px.
- **Corner Styling**: Individual corner radius controls for rectangles (Top-Left, Top-Right, etc.) with a sync toggle.
- **Dynamic Color System**:
  - Independent Stroke and Fill colors.
  - Granular opacity sliders (0-100%) for both stroke and fill.
  - Instant toggle for shape filling.
- **Modern UI**: A light-themed, dotted grid editor background for better alignment, paired with a sophisticated dark-themed glassmorphic toolbar.

---

## ⌨️ Keyboard Shortcuts

Speed up your workflow with these native shortcuts:

| Shortcut | Action |
| :--- | :--- |
| **Ctrl + Z** | Undo last action |
| **Ctrl + Y** | Redo last action |
| **Ctrl + C** | Copy selected shape |
| **Ctrl + V** | Paste copied shape |
| **Ctrl + Shift + C** | Copy canvas to clipboard |
| **Del / Backspace** | Delete selected object |
| **Esc** | Deselect object / Close manual |

---

## 🛠️ Tech Stack

- **Core**: JavaScript (ES6+), HTML5, CSS3.
- **API**: Chrome Extension Manifesto V3.
- **Styling**: Vanilla CSS with modern variables, flexbox/grid layouts, and glassmorphism.
- **Rendering**: Canvas API for high-performance image manipulation and object tracking.

---

## 🚀 Installation (Development Mode)

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** (toggle in the top right).
4. Click **"Load unpacked"** and select the root directory of this project.
5. The **ScreenCap** icon should now appear in your extensions list.

---

## 📖 Usage Guide

1. **Capture**: Click the ScreenCap icon in your browser toolbar to capture the active tab.
2. **Edit**: Use the floating toolbar to annotate your screenshot.
   - **Select & Resize**: Use the Select tool to move or resize any element.
   - **Styling**: Adjust colors, thickness, or opacity from the contextual controls.
   - **Text**: Click to add text, or click existing text to edit it directly.
3. **Save & Share**:
   - **Save Image**: Download your work as a PNG.
   - **Copy to Clipboard**: Use the clipboard icon or `Ctrl + Shift + C` to instantly copy the final image for pasting into Slack, Discord, or emails.
4. **User Manual**: Need help? Click the `?` icon in the toolbar for an integrated guide.

---

## 🛡️ License

This project is created for demonstration and personal use. Feel free to explore and modify!

---

*Crafted with ❤️ by Parag Dhali*
