import io
import base64
from fastapi import FastAPI, UploadFile, File
from PIL import Image
import torch
import numpy as np
from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation

app = FastAPI()

MODEL_NAME = "mattmdjaga/segformer_b2_clothes"
processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
model = AutoModelForSemanticSegmentation.from_pretrained(MODEL_NAME)
model.eval()

def mask_to_base64_png(mask_bool_2d):
    mask_u8 = (mask_bool_2d.astype(np.uint8) * 255)
    img = Image.fromarray(mask_u8, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

@app.post("/segment")
async def segment_garment(file: UploadFile = File(...)):
    contents = await file.read()
    pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
    orig_w, orig_h = pil_img.size

    max_dim = max(orig_w, orig_h)
    if max_dim > 1024:
        scale = 1024.0 / max_dim
        inf_w, inf_h = int(orig_w * scale), int(orig_h * scale)
        inf_img = pil_img.resize((inf_w, inf_h), Image.Resampling.BILINEAR)
    else:
        inf_img = pil_img

    inputs = processor(images=inf_img, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
        upsampled = torch.nn.functional.interpolate(
            outputs.logits, size=(orig_h, orig_w), mode="bilinear", align_corners=False
        )
        pred = upsampled.argmax(dim=1)[0].cpu().numpy()

    # Protect: 0 Background, 2 Hair, 11 Face, 14/15 Arms, 12/13 Legs
    protect_mask = np.isin(pred, [0, 1, 2, 3, 9, 10, 11, 12, 13, 14, 15, 16])
    upper_mask = np.isin(pred, [4]) & (~protect_mask)
    lower_mask = np.isin(pred, [5, 6]) & (~protect_mask)
    both_mask = np.isin(pred, [4, 5, 6, 7]) & (~protect_mask)

    return {
        "success": True,
        "width": orig_w,
        "height": orig_h,
        "upper": mask_to_base64_png(upper_mask),
        "lower": mask_to_base64_png(lower_mask),
        "both": mask_to_base64_png(both_mask),
        "protect": mask_to_base64_png(protect_mask),
    }

@app.get("/health")
def health():
    return {"status": "ok"}