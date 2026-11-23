import sys
import os
import json
import base64
import io
import hashlib
from PIL import Image
import numpy as np

# Load fashn human parser
try:
    from fashn_human_parser import FashnHumanParser
    parser = FashnHumanParser(device="cpu")
except Exception as e:
    parser = None
    sys.stderr.write(f"Parser initialization error: {e}\n")

def mask_to_base64_png(mask_bool_2d):
    mask_u8 = (mask_bool_2d.astype(np.uint8) * 255)
    img = Image.fromarray(mask_u8, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

def segment_image(image_path_or_bytes):
    if isinstance(image_path_or_bytes, bytes):
        pil_img = Image.open(io.BytesIO(image_path_or_bytes)).convert("RGB")
    else:
        pil_img = Image.open(image_path_or_bytes).convert("RGB")

    arr = np.array(pil_img)

    if parser is None:
        raise RuntimeError("FashnHumanParser not available")

    pred = parser.predict(arr)

    # Upper: top (3), dress (4), torso (16)
    upper_mask = np.isin(pred, [3, 4, 16])

    # Lower: skirt (5), pants (6)
    lower_mask = np.isin(pred, [5, 6])

    # Both: upper + lower
    both_mask = upper_mask | lower_mask

    return {
        "width": pil_img.width,
        "height": pil_img.height,
        "upper": mask_to_base64_png(upper_mask),
        "lower": mask_to_base64_png(lower_mask),
        "both": mask_to_base64_png(both_mask),
        "counts": {
            "upper": int(np.sum(upper_mask)),
            "lower": int(np.sum(lower_mask)),
            "both": int(np.sum(both_mask)),
        }
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python segment_garment.py <image_path_or_url>\n")
        sys.exit(1)

    target_path = sys.argv[1]
    try:
        result = segment_image(target_path)
        print(json.dumps(result))
    except Exception as err:
        sys.stderr.write(str(err) + "\n")
        sys.exit(1)
