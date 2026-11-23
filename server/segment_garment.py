import sys
import os
import json
import base64
import io
import warnings
warnings.filterwarnings("ignore")

import torch
import numpy as np
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation

MODEL_NAME = "mattmdjaga/segformer_b2_clothes"

# Cache processor and model globally
_processor = None
_model = None

def get_model():
    global _processor, _model
    if _model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
        _model = AutoModelForSemanticSegmentation.from_pretrained(MODEL_NAME)
        _model.to(device)
        _model.eval()
    return _processor, _model

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

    orig_w, orig_h = pil_img.size

    # Resize to max 1024px for fast inference if larger
    max_dim = max(orig_w, orig_h)
    if max_dim > 1024:
        scale = 1024.0 / max_dim
        inf_w = int(orig_w * scale)
        inf_h = int(orig_h * scale)
        inf_img = pil_img.resize((inf_w, inf_h), Image.Resampling.BILINEAR)
    else:
        inf_img = pil_img

    processor, model = get_model()
    device = "cuda" if torch.cuda.is_available() else "cpu"

    inputs = processor(images=inf_img, return_tensors="pt")
    if device == "cuda":
        inputs = {k: v.to("cuda") for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits  # shape: (1, 18, H/4, W/4)
        # Upsample logits back to original image resolution with bilinear interpolation
        upsampled = torch.nn.functional.interpolate(
            logits,
            size=(orig_h, orig_w),
            mode="bilinear",
            align_corners=False
        )
        pred = upsampled.argmax(dim=1)[0].cpu().numpy()

    # Classes for mattmdjaga/segformer_b2_clothes:
    # 0: Background, 1: Hat, 2: Hair, 3: Sunglasses, 4: Upper-clothes,
    # 5: Skirt, 6: Pants, 7: Dress, 8: Belt, 9: Left-shoe, 10: Right-shoe,
    # 11: Face, 12: Left-leg, 13: Right-leg, 14: Left-arm, 15: Right-arm, 16: Bag, 17: Scarf

    # Protect mask: Hair (2), Face (11), Left/Right Arm (14, 15), Left/Right Leg (12, 13), Background (0) + accessories/shoes/bag
    protect_mask = np.isin(pred, [0, 1, 2, 3, 9, 10, 11, 12, 13, 14, 15, 16])

    # Upper: Upper-clothes (4), strictly excluding protect_mask
    upper_mask = np.isin(pred, [4]) & (~protect_mask)

    # Lower: Skirt (5), Pants (6), strictly excluding protect_mask
    lower_mask = np.isin(pred, [5, 6]) & (~protect_mask)

    # Both: Upper + Lower + Dress (7), strictly excluding protect_mask
    both_mask = np.isin(pred, [4, 5, 6, 7]) & (~protect_mask)

    return {
        "success": True,
        "width": orig_w,
        "height": orig_h,
        "upper": mask_to_base64_png(upper_mask),
        "lower": mask_to_base64_png(lower_mask),
        "both": mask_to_base64_png(both_mask),
        "protect": mask_to_base64_png(protect_mask),
        "counts": {
            "upper": int(np.sum(upper_mask)),
            "lower": int(np.sum(lower_mask)),
            "both": int(np.sum(both_mask)),
            "protect": int(np.sum(protect_mask)),
        }
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python segment_garment.py <image_path>\n")
        sys.exit(1)

    target_path = sys.argv[1]
    try:
        result = segment_image(target_path)
        print(json.dumps(result))
    except Exception as err:
        sys.stderr.write(str(err) + "\n")
        sys.exit(1)
