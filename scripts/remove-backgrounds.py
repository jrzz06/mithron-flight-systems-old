#!/usr/bin/env python3
"""
Background removal script for Agri Community World and City Drone World images.
Uses rembg library for AI-powered background removal.

Usage:
  pip install rembg pillow
  python scripts/remove-backgrounds.py
"""

import os
from pathlib import Path
from PIL import Image
from rembg import remove

def get_project_root():
    """Get the project root directory."""
    return Path(__file__).parent.parent

def remove_backgrounds():
    """Remove backgrounds from all images in mission directories."""
    project_root = get_project_root()
    
    # Define image directories
    image_dirs = [
        project_root / "public" / "media" / "mithron" / "mission" / "agrone",
        project_root / "public" / "media" / "mithron" / "mission" / "city",
    ]
    
    total_processed = 0
    total_failed = 0
    
    for image_dir in image_dirs:
        if not image_dir.exists():
            print(f"⚠️  Directory not found: {image_dir}")
            continue
        
        print(f"\n📁 Processing: {image_dir.name}")
        print("=" * 60)
        
        # Process all PNG files
        png_files = list(image_dir.glob("*.png"))
        
        if not png_files:
            print("   No PNG files found")
            continue
        
        for image_path in png_files:
            try:
                print(f"   Processing: {image_path.name}...", end=" ")
                
                # Read image
                with open(image_path, "rb") as i:
                    input_data = i.read()
                
                # Remove background
                output_data = remove(input_data)
                
                # Save as PNG with transparency
                with open(image_path, "wb") as o:
                    o.write(output_data)
                
                # Verify the output
                img = Image.open(image_path)
                print(f"✅ Done ({img.size[0]}x{img.size[1]})")
                total_processed += 1
                
            except Exception as e:
                print(f"❌ Failed: {str(e)}")
                total_failed += 1
    
    # Summary
    print("\n" + "=" * 60)
    print(f"📊 Summary: {total_processed} processed, {total_failed} failed")
    
    if total_failed == 0:
        print("✨ All images processed successfully!")
    
    return total_failed == 0

if __name__ == "__main__":
    print("🎯 Background Removal Script")
    print("=" * 60)
    
    success = remove_backgrounds()
    exit(0 if success else 1)
