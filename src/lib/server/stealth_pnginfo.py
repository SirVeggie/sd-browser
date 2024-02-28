import asyncio
from collections import OrderedDict
import sys
from PIL import Image
from PIL.PngImagePlugin import PngInfo
import gzip
from PIL import ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True

def add_stealth_pnginfo(params):
    if not params['filename'].endswith('.png') or params['pnginfo'] is None:
        return
    if 'parameters' not in params['pnginfo']:
        return
    params['image'] = Image.open(r''+params['path'])
    add_data(params)

def prepare_data(params, mode='alpha', compressed=False):
    signature = f"stealth_{'png' if mode == 'alpha' else 'rgb'}{'info' if not compressed else 'comp'}"
    binary_signature = ''.join(format(byte, '08b') for byte in signature.encode('utf-8'))
    param = params.encode('utf-8') if not compressed else gzip.compress(bytes(params, 'utf-8'))
    binary_param = ''.join(format(byte, '08b') for byte in param)
    binary_param_len = format(len(binary_param), '032b')
    return binary_signature + binary_param_len + binary_param

def add_data(params, mode='alpha', compressed=False):
    binary_data = prepare_data(params['pnginfo']['parameters'], mode, compressed)
    if mode == 'alpha':
        params['image'].putalpha(255)
    width, height = params['image'].size
    pixels = params['image'].load()
    index = 0
    end_write = False
    for x in range(width):
        for y in range(height):
            if index >= len(binary_data):
                end_write = True
                break
            values = pixels[x, y]
            if mode == 'alpha':
                r, g, b, a = values
            else:
                r, g, b = values
            if mode == 'alpha':
                a = (a & ~1) | int(binary_data[index])
                index += 1
            else:
                r = (r & ~1) | int(binary_data[index])
                if index + 1 < len(binary_data):
                    g = (g & ~1) | int(binary_data[index + 1])
                if index + 2 < len(binary_data):
                    b = (b & ~1) | int(binary_data[index + 2])
                index += 3
            pixels[x, y] = (r, g, b, a) if mode == 'alpha' else (r, g, b)
        if end_write:
            break

    metadata = PngInfo()
    metadata.add_text("parameters", params['pnginfo']['parameters'])
    params['image'].save(params['filename'], pnginfo=metadata)

async def read_info_from_image_stealth(path):
    image = Image.open(r''+path)
    geninfo = ''
    # trying to read stealth pnginfo
    width, height = image.size
    pixels = image.load()

    has_alpha = True if image.mode == 'RGBA' else False
    mode = None
    compressed = False
    binary_data = ''
    buffer_a = ''
    buffer_rgb = ''
    index_a = 0
    index_rgb = 0
    sig_confirmed = False
    confirming_signature = True
    reading_param_len = False
    reading_param = False
    read_end = False
    for x in range(width):
        for y in range(height):
            if has_alpha:
                r, g, b, a = pixels[x, y]
                buffer_a += str(a & 1)
                index_a += 1
            else:
                r, g, b = pixels[x, y]
            buffer_rgb += str(r & 1)
            buffer_rgb += str(g & 1)
            buffer_rgb += str(b & 1)
            index_rgb += 3
            if confirming_signature:
                if index_a == len('stealth_pnginfo') * 8:
                    decoded_sig = bytearray(int(buffer_a[i:i + 8], 2) for i in
                                            range(0, len(buffer_a), 8)).decode('utf-8', errors='ignore')
                    if decoded_sig in {'stealth_pnginfo', 'stealth_pngcomp'}:
                        confirming_signature = False
                        sig_confirmed = True
                        reading_param_len = True
                        mode = 'alpha'
                        if decoded_sig == 'stealth_pngcomp':
                            compressed = True
                        buffer_a = ''
                        index_a = 0
                    else:
                        read_end = True
                        break
                elif index_rgb == len('stealth_pnginfo') * 8:
                    decoded_sig = bytearray(int(buffer_rgb[i:i + 8], 2) for i in
                                            range(0, len(buffer_rgb), 8)).decode('utf-8', errors='ignore')
                    if decoded_sig in {'stealth_rgbinfo', 'stealth_rgbcomp'}:
                        confirming_signature = False
                        sig_confirmed = True
                        reading_param_len = True
                        mode = 'rgb'
                        if decoded_sig == 'stealth_rgbcomp':
                            compressed = True
                        buffer_rgb = ''
                        index_rgb = 0
            elif reading_param_len:
                if mode == 'alpha':
                    if index_a == 32:
                        param_len = int(buffer_a, 2)
                        reading_param_len = False
                        reading_param = True
                        buffer_a = ''
                        index_a = 0
                else:
                    if index_rgb == 33:
                        pop = buffer_rgb[-1]
                        buffer_rgb = buffer_rgb[:-1]
                        param_len = int(buffer_rgb, 2)
                        reading_param_len = False
                        reading_param = True
                        buffer_rgb = pop
                        index_rgb = 1
            elif reading_param:
                if mode == 'alpha':
                    if index_a == param_len:
                        binary_data = buffer_a
                        read_end = True
                        break
                else:
                    if index_rgb >= param_len:
                        diff = param_len - index_rgb
                        if diff < 0:
                            buffer_rgb = buffer_rgb[:diff]
                        binary_data = buffer_rgb
                        read_end = True
                        break
            else:
                # impossible
                read_end = True
                break
        if read_end:
            break
    if sig_confirmed and binary_data != '':
        # Convert binary string to UTF-8 encoded text
        byte_data = bytearray(int(binary_data[i:i + 8], 2) for i in range(0, len(binary_data), 8))
        try:
            if compressed:
                decoded_data = gzip.decompress(bytes(byte_data)).decode('utf-8')
            else:
                decoded_data = byte_data.decode('utf-8', errors='ignore')
            geninfo = decoded_data
        except:
            pass
    return geninfo#, items

async def original_read_info_from_image(paths):
    for i, attachment in enumerate(paths):
        metadata = OrderedDict()
        await read_attachment_metadata(i, attachment, metadata)
        if metadata:
            return metadata

async def read_attachment_metadata(i: int, path: str, metadata: OrderedDict):
    try:
        with Image.open(r''+path) as img:
            if img.info:
                if 'parameters' in img.info:
                    info = img.info['parameters']
                elif 'prompt' in img.info:
                    info = img.info['prompt']
                else:
                    info = img.info["Comment"]
                
            if info:
                metadata[i] = info
    except Exception as error:
        pass

async def main():
    geninfo = await read_info_from_image_stealth(sys.argv[1])
    if not geninfo:
        geninfo = (await original_read_info_from_image([sys.argv[1]]))[0]
        if not (len(sys.argv) > 2 and sys.argv[2] == 'read'):
            add_stealth_pnginfo({'filename': sys.argv[1].split('/')[len(sys.argv[1].split('/'))-1], 'pnginfo': {'parameters':geninfo}, 'path': sys.argv[1]})
    print(geninfo)

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    sys.stdout.flush()