from PIL import Image, ImageDraw
import os

def create_simple_icon(size, output_path):
    # Create a new image with a white background
    image = Image.new('RGB', (size, size), 'white')
    draw = ImageDraw.Draw(image)
    
    # Draw a blue circle
    margin = size // 4
    draw.ellipse([margin, margin, size - margin, size - margin], fill='#4285f4')
    
    # Draw a white 'G' in the center
    font_size = size // 2
    draw.text((size//2 - font_size//4, size//2 - font_size//3), 'G', 
              fill='white', font=None, font_size=font_size)
    
    # Save the image
    image.save(output_path)

def main():
    # Create icons directory if it doesn't exist
    icons_dir = 'extension/icons'
    os.makedirs(icons_dir, exist_ok=True)
    
    # Generate icons of different sizes
    sizes = [16, 48, 128]
    for size in sizes:
        output_path = f'{icons_dir}/icon{size}.png'
        create_simple_icon(size, output_path)
        print(f'Created icon: {output_path}')

if __name__ == '__main__':
    main() 