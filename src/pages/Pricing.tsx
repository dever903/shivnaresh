import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  ShieldCheck,
  Zap,
  Building2,
  HelpCircle,
  ArrowRight,
  MessageSquare,
  AlertCircle,
  ExternalLink,
  X,
  CheckCircle2,
  Loader2,
  Lock,
  ChevronDown,
  ChevronUp,
  Printer,
  FileText,
  Copy,
} from 'lucide-react';
import { useTheme } from '../lib/theme';
import SiteFooter from '../components/SiteFooter';
import { api, type GatewayConfig, type GatewayOrder } from '../lib/api';

const DEFAULT_USD_TO_INR = 94.0;

function numberToWordsINR(amount: number): string {
  const n = Math.floor(Math.abs(amount));
  if (n === 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(val: number): string {
    if (val === 0) return '';
    if (val < 20) return ones[val];
    const t = tens[Math.floor(val / 10)];
    const u = ones[val % 10];
    return u ? `${t}-${u}` : t;
  }

  function convertThreeDigits(val: number): string {
    const h = Math.floor(val / 100);
    const rem = val % 100;
    const hPart = h > 0 ? `${ones[h]} Hundred` : '';
    const remPart = convertTwoDigits(rem);
    if (hPart && remPart) return `${hPart} ${remPart}`;
    return hPart || remPart;
  }

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const remainder = n % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${convertTwoDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertTwoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertTwoDigits(thousand)} Thousand`);
  if (remainder > 0) parts.push(convertThreeDigits(remainder));

  return `${parts.join(' ')} Rupees Only`;
}

function printInvoiceDocument(order: GatewayOrder | null, plan: Plan | null, clientName: string, inrFallback: number, upiId: string) {
  const invoiceNo = order?.invoice_no || '1450903';
  const invoiceDate = order?.invoice_date
    ? new Date(order.invoice_date).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB');
  const amount = order?.amount || inrFallback || 0;
  const formattedAmount = amount.toLocaleString('en-IN');
  const amountWords = numberToWordsINR(amount);
  const photoshoots = plan?.specs?.photoshoots || (plan?.id === 'ultra' ? 100 : plan?.id === 'pro' ? 60 : 20);
  const videos = plan?.specs?.videos || (plan?.id === 'ultra' ? 6 : plan?.id === 'pro' ? 4 : 1);
  const billToName = clientName.trim() || 'Shiv-Naresh Sports Private Limited';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice_${invoiceNo}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 16mm 14mm 16mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11.5px;
      line-height: 1.4;
    }
    .invoice-card {
      width: 100%;
      max-width: 680px;
      margin: 0 auto;
    }
    .two-col {
      display: flex;
      justify-content: space-between;
      gap: 28px;
    }
    .header-rule {
      border-bottom: 2px solid #1F3A5F;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 900;
      color: #1F3A5F;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .col-title {
      font-size: 10px;
      font-weight: 800;
      color: #1F3A5F;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .party-name {
      font-weight: 700;
      font-size: 13px;
      color: #111827;
      margin-bottom: 2px;
    }
    .party-detail {
      color: #4b5563;
      font-size: 11.5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 14px 0;
      border: 1px solid #bbbbbb;
    }
    thead tr {
      background-color: #1F3A5F;
      color: #ffffff;
    }
    th {
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #bbbbbb;
    }
    td {
      padding: 10px 12px;
      font-size: 11.5px;
      border: 1px solid #bbbbbb;
      vertical-align: top;
    }
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 12px;
    }
    .totals-box {
      width: 250px;
      font-size: 11.5px;
      line-height: 1.65;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      color: #4b5563;
    }
    .totals-highlight {
      display: flex;
      justify-content: space-between;
      background: #EEF2F8;
      padding: 2.5px 6px;
      font-weight: 700;
      color: #111827;
      border-top: 1.5px solid #1F3A5F;
      margin: 2px 0;
    }
    .words-box {
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
      margin-bottom: 16px;
      font-size: 11.5px;
    }
    .payment-box {
      border: 1px solid #bbbbbb;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 16px;
      font-size: 11.5px;
    }
    .payment-header {
      background-color: #EEF2F8;
      padding: 5px 10px;
      font-size: 10px;
      font-weight: 800;
      color: #1F3A5F;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #bbbbbb;
    }
    .payment-body {
      padding: 7px 10px;
      line-height: 1.55;
      color: #374151;
    }
    .footer-notes {
      font-size: 10px;
      color: #6b7280;
      line-height: 1.5;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="two-col header-rule" style="align-items: flex-end;">
      <div>
        <h1 class="brand-title">INVOICE</h1>
      </div>
      <div style="text-align: right; line-height: 1.55;">
        <div><strong style="color: #4b5563;">Invoice No:</strong> <span style="font-family: monospace; font-weight: 700; color: #111827;">${invoiceNo}</span></div>
        <div><strong style="color: #4b5563;">Date:</strong> <span style="color: #111827;">${invoiceDate}</span></div>
        <div><strong style="color: #4b5563;">Status:</strong> <span style="color: #1B7F3B; font-weight: 800;">PAID</span></div>
      </div>
    </div>

    <div class="two-col" style="margin-bottom: 14px;">
      <div>
        <div class="col-title">FROM (SELLER)</div>
        <div class="party-name">Pawan Kumar</div>
        <div class="party-detail">Photo &amp; Video Shoot Services</div>
        <div class="party-detail">256, Gali No. 5, Tukmirpur Ext,</div>
        <div class="party-detail">Karawal Nagar, Delhi - 110094</div>
      </div>
      <div>
        <div class="col-title">BILL TO</div>
        <div class="party-name">${billToName}</div>
        <div class="party-detail">E-23, Karampura,</div>
        <div class="party-detail">New Delhi - 110015</div>
        <div class="party-detail" style="font-family: monospace; font-size: 10.5px; margin-top: 2px;">CIN: U18109DL1998PTC097659</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 36px; text-align: center;">#</th>
          <th style="text-align: left;">Description</th>
          <th style="width: 48px; text-align: center;">Qty</th>
          <th style="width: 130px; text-align: right;">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: center; font-weight: 600;">1</td>
          <td>
            <div style="font-weight: 700; color: #111827; margin-bottom: 3px;">Photo &amp; Video Shoot Services</div>
            <div style="color: #4b5563; margin-bottom: 2px;">- ${photoshoots} photo shoots (each shoot = 5 poses)</div>
            <div style="color: #4b5563;">- ${videos} videos in 1080p, each 5 to 10 seconds long</div>
          </td>
          <td style="text-align: center;">1</td>
          <td style="text-align: right; font-family: monospace; font-weight: 600;">${formattedAmount}.00</td>
        </tr>
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="totals-box">
        <div class="totals-row"><span>Subtotal</span><span style="font-family: monospace;">INR ${formattedAmount}.00</span></div>
        <div class="totals-row"><span>GST</span><span>Not applicable</span></div>
        <div class="totals-highlight"><span>Total</span><span style="font-family: monospace;">INR ${formattedAmount}.00</span></div>
        <div class="totals-row"><span>Amount Paid</span><span style="font-family: monospace;">INR ${formattedAmount}.00</span></div>
        <div class="totals-row" style="font-weight: 700; color: #111827;"><span>Balance Due</span><span style="font-family: monospace;">INR 0.00</span></div>
      </div>
    </div>

    <div class="words-box">
      <strong style="color: #111827;">Amount in words:</strong> <span style="font-style: italic; color: #374151;">${amountWords}</span>
    </div>

    <div class="payment-box">
      <div class="payment-header">PAYMENT DETAILS</div>
      <div class="payment-body">
        <div><strong>Payment method:</strong> UPI</div>
        <div><strong>UPI ID:</strong> <span style="font-family: monospace;">${upiId}</span></div>
        <div><strong>Status:</strong> Received in full</div>
      </div>
    </div>

    <div class="footer-notes">
      <div><strong>Notes:</strong> The seller is not registered under GST; no GST has been charged on this invoice.</div>
      <div style="text-align: center; margin-top: 12px; font-weight: 500; color: #4b5563;">Thank you for your business.</div>
    </div>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 100);
    };
  </script>
</body>
</html>`;

  let frame = document.getElementById('sn-invoice-print-frame') as HTMLIFrameElement;
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = 'sn-invoice-print-frame';
    frame.style.position = 'fixed';
    frame.style.top = '-9999px';
    frame.style.left = '-9999px';
    frame.style.width = '0px';
    frame.style.height = '0px';
    frame.style.border = 'none';
    document.body.appendChild(frame);
  }

  const doc = frame.contentWindow?.document || frame.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  }
}

interface Plan {
  id: string;
  name: string;
  tagline: string;
  priceUSD: number;
  priceINR?: number;
  featured?: boolean;
  badge?: string;
  active?: boolean;
  deleted?: boolean;
  specs: {
    photoshoots: string;
    models?: string;
    videos: string;
    credits: string;
    bonusCredits?: string;
    delivery: string;
    support: string;
    resolution: string;
  };
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter Trial',
    tagline: 'Instant zero-risk trial for emerging sportswear designers',
    priceUSD: 0,
    specs: {
      photoshoots: 'Self-Service Catalog',
      models: 'Self-Service Catalog',
      videos: 'Trial Generation',
      credits: '5 Free Credits',
      delivery: 'Instant AI Pipeline',
      support: 'Community Helpdesk',
      resolution: 'Standard HD Neural Quality'
    },
    features: [
      '5 free trial credits upon verified signup',
      'Photorealistic studio neural generation',
      'Standard 5s neural motion video preview',
      'Full access to curated studio photoshoot library',
      'SHIV-NARESH verified branding in prompts',
      'Instant AI pipeline access',
      '1 photoshoot = 6 poses (wrong attempts count)'
    ]
  },
  {
    id: 'ondemand',
    name: 'On-Demand Growth',
    tagline: 'Ideal for seasonal sportswear drops and catalogue shoots',
    priceUSD: 49,
    specs: {
      photoshoots: '20 Photoshoots (approx) · 1 Photoshoot = 6 Poses (120 Images)',
      models: '20 Photoshoots (approx) · 1 Photoshoot = 6 Poses (120 Images)',
      videos: '2 High-Def Neural Videos (5-10s)',
      credits: '200 Monthly Credits in Account',
      delivery: 'Instant Neural Engine',
      support: 'Priority Email & Chat',
      resolution: 'Studio HD Master Quality'
    },
    features: [
      '20 Curated Photoshoots (approx) · 1 photoshoot = 6 poses = 120 images total',
      '2 High-Def 5-10 second vertical/horizontal sportswear videos',
      '200 active credits in your account (rollover for 30 billing days)',
      'Wrong/test generations are counted in image generation count (6 poses = 1 photoshoot)',
      'Dual photoshoot swap & fabric color accuracy conditioning',
      '1-hour grace window to edit/delete uploaded assets',
      'Priority email & WhatsApp customer support'
    ]
  },
  {
    id: 'pro',
    name: 'Pro Atelier',
    tagline: 'Engineered for top sportswear fashion houses & high-volume ecommerce',
    priceUSD: 149,
    featured: true,
    badge: 'MOST POPULAR',
    specs: {
      photoshoots: '60 Photoshoots (approx) · 1 Photoshoot = 6 Poses (360 Images) · 1 Month Expiry',
      models: '60 Photoshoots (approx) · 1 Photoshoot = 6 Poses (360 Images) · 1 Month Expiry',
      videos: '4 Cinematic 1080p Videos · 1 Month Expiry',
      credits: '400 Credits + 100 Bonus = 500 Total',
      delivery: 'High-Priority Neural Queue',
      support: 'Direct WhatsApp Account Mgr',
      resolution: 'Studio Photoreal + 1080p Motion'
    },
    features: [
      '60 Curated Photoshoots (approx) · 1 photoshoot = 6 poses = 360 images total',
      '4 Cinematic 1080p Videos (9:16 Reels & 16:9 Sportswear cuts)',
      '400 Monthly Credits + 100 FREE Bonus Credits (500 credits total)',
      'Wrong/test generations are counted in image generation count (6 poses = 1 photoshoot)',
      'All photoshoots & videos valid for 1 month subscription cycle',
      'Priority rendering queue for instant zero-wait generation',
      'Dedicated WhatsApp account executive',
      'Iterative prompt refiner with fabric color-matching precision',
      'Zero credit waste: 1-hour grace cancellation window'
    ]
  },
  {
    id: 'ultra',
    name: 'Ultra Haute-Couture',
    tagline: 'Complete digital production house: upload fabrics & receive custom shoot',
    priceUSD: 249,
    badge: 'ENTERPRISE ATELIER',
    specs: {
      photoshoots: '100 Custom Photoshoots (Max 10/Day · 1 Photoshoot = 6 Poses) · 1 Month Expiry',
      models: '100 Custom Photoshoots (Max 10/Day · 1 Photoshoot = 6 Poses) · 1 Month Expiry',
      videos: '6 Studio Videos (1 Month Expiry)',
      credits: '100 Account Credits (Custom shoots free)',
      delivery: 'Guaranteed 24-48h Delivery',
      support: '24/7 Dedicated Human Art Team',
      resolution: 'Master Photoreal & 1080p Studio Motion'
    },
    features: [
      'Custom Atelier Service: upload cloths & garments in Custom Requests',
      'Daily Production Quota: Max 10 custom photoshoots (1 photoshoot = 6 poses)',
      'Total 100 Photoshoots (600 Poses) + 6 Studio Videos delivered within 24-48 hours (1 month validity)',
      '100 active credits in your account for rapid neural experimentation',
      'Wrong/test generations are counted in image generation count (6 poses = 1 photoshoot)',
      'Photoshoots & studio videos in custom requests do NOT consume your account credits',
      'Post-generation touch-ups, prompt refinements, and multi-pose changes',
      '100% human studio team fulfillment guarantee if neural API undergoes downtime',
      'Direct line to lead fashion director & 24/7 VIP assistance'
    ]
  }
];

export default function Pricing() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  const [plansList, setPlansList] = useState<Plan[]>(() => {
    try {
      const cached = localStorage.getItem('cached_plan_prices');
      if (cached) {
        const parsed = JSON.parse(cached);
        return PLANS.map((p) => {
          const custom = parsed[p.id];
          if (!custom) return p;
          return {
            ...p,
            priceUSD: custom.priceUSD !== undefined ? Number(custom.priceUSD) : p.priceUSD,
            priceINR: custom.priceINR !== undefined && Number(custom.priceINR) > 0 ? Number(custom.priceINR) : undefined,
          };
        });
      }
    } catch {}
    return PLANS;
  });
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [localQrDataUrl, setLocalQrDataUrl] = useState<string>('');
  const qrMode = 'fixed';
  const [showEnlargedQr, setShowEnlargedQr] = useState<boolean>(false);

  const [usdToInrRate, setUsdToInrRate] = useState<number>(DEFAULT_USD_TO_INR);

  /* UPI Gateway Live State */
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>(null);
  const [activeOrder, setActiveOrder] = useState<GatewayOrder | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  /* Code 1450903 Invoice Generation & Expandable Features State */
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});
  const [verificationCode, setVerificationCode] = useState('');
  const [invoiceGenerated, setInvoiceGenerated] = useState(false);
  const [codeSubmitError, setCodeSubmitError] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);

  useEffect(() => {
    // Real-time live USD to INR exchange rate fetcher
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((res) => res.json())
      .then((data) => {
        if (data?.rates?.INR && typeof data.rates.INR === 'number') {
          setUsdToInrRate(Math.round(data.rates.INR * 100) / 100);
        }
      })
      .catch(() => {
        // Fallback to recent dynamic market rate
        setUsdToInrRate(94.0);
      });

    // Auto-fill logged in user info
    api.me()
      .then((res) => {
        if (res?.user) {
          setCurrentUser(res.user);
          if (res.user.email) setUserEmail(res.user.email);
          if (res.user.name) setUserName(res.user.name);
        }
      })
      .catch(() => {});

    const applyDynamicPlans = (plansObj: Record<string, any>) => {
      if (!plansObj || typeof plansObj !== 'object') return;
      try {
        localStorage.setItem('cached_plan_prices', JSON.stringify(plansObj));
      } catch {}
      setPlansList((prev) =>
        prev.map((p) => {
          const custom = plansObj[p.id];
          if (!custom) return p;
          return {
            ...p,
            priceUSD: custom.priceUSD !== undefined ? Number(custom.priceUSD) : p.priceUSD,
            priceINR: custom.priceINR !== undefined && Number(custom.priceINR) > 0 ? Number(custom.priceINR) : undefined,
            active: custom.active !== undefined ? Boolean(custom.active) : true,
            deleted: custom.deleted !== undefined ? Boolean(custom.deleted) : false,
          };
        })
      );
    };

    // Parallel fetch without race conditions or UI flickers
    void Promise.allSettled([api.plans(), api.gatewayConfig()]).then(([pRes, gRes]) => {
      if (gRes.status === 'fulfilled' && gRes.value?.ok) {
        setGatewayConfig(gRes.value);
        if (gRes.value.plans) applyDynamicPlans(gRes.value.plans);
      }
      if (pRes.status === 'fulfilled' && pRes.value?.plans) {
        applyDynamicPlans(pRes.value.plans);
      }
    });
  }, []);

  // Poll active order status every 3.5s while checkout modal is open
  useEffect(() => {
    if (!showCheckoutModal || !activeOrder?.order_no || activeOrder.status === 'paid' || activeOrder.status === 'failed') {
      return;
    }

    const timer = setInterval(async () => {
      try {
        const res = await api.getGatewayOrderStatus(activeOrder.order_no);
        if (res?.paid) {
          setActiveOrder((prev) => (prev ? { ...prev, status: 'paid', utr: res.utr || prev.utr } : null));
        } else if (res?.status && res.status !== activeOrder.status) {
          setActiveOrder((prev) => (prev ? { ...prev, status: res.status as any } : null));
        }
      } catch {
        // quiet polling failure
      }
    }, 3500);

    return () => clearInterval(timer);
  }, [showCheckoutModal, activeOrder?.order_no, activeOrder?.status]);

  const handleChoosePlan = (plan: Plan) => {
    if (plan.priceUSD === 0) {
      window.location.href = '/design';
      return;
    }
    setSelectedPlan(plan);
    setVerificationCode('');
    setCodeSubmitError('');
    setInvoiceGenerated(false);
    setShowTermsModal(false);
    setShowCheckoutModal(true);
    void createOrGetOrder('upi', plan);
  };

  const handleAgreeTerms = () => {
    setShowTermsModal(false);
    setShowCheckoutModal(true);
    if (selectedPlan) {
      void createOrGetOrder('upi', selectedPlan);
    }
  };

  const inrAmount = selectedPlan
    ? (selectedPlan.priceINR && selectedPlan.priceINR > 0
        ? selectedPlan.priceINR
        : Math.round(selectedPlan.priceUSD * usdToInrRate))
    : 0;
  const upiId = gatewayConfig?.upiId || '6398743132@ybl';
  const payeeName = gatewayConfig?.payeeName || 'PAWAN KUMAR';
  const bankDetails = gatewayConfig?.bankDetails || {
    accountNumber: '41614259248',
    ifsc: 'SBIN0011558',
    bankName: 'State Bank of India',
    accountHolder: 'PAWAN KUMAR',
  };

  // Create or retrieve existing gateway order
  const createOrGetOrder = async (method: 'upi' | 'bank', targetPlan?: Plan) => {
    const planToUse = targetPlan || selectedPlan;
    if (!planToUse) return;
    setOrderLoading(true);
    const amt = planToUse.priceINR && planToUse.priceINR > 0
      ? planToUse.priceINR
      : Math.round(planToUse.priceUSD * usdToInrRate);
    try {
      const res = await api.createGatewayOrder({
        amount: amt,
        plan_id: planToUse.id,
        customer_name: userName.trim() || undefined,
        customer_email: userEmail.trim() || undefined,
        payment_method: method,
        redirect_url: '/design',
      });
      if (res?.data) {
        setActiveOrder(res.data);
      }
    } catch (err: any) {
      console.warn('Gateway order init warning:', err);
    } finally {
      setOrderLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const code = verificationCode.trim();
    if (!code) {
      setCodeSubmitError('Please enter your authorization code.');
      return;
    }
    setVerifyingCode(true);
    setCodeSubmitError('');
    try {
      let orderToVerify = activeOrder;
      if (!orderToVerify && selectedPlan) {
        const amt = selectedPlan.priceINR && selectedPlan.priceINR > 0
          ? selectedPlan.priceINR
          : Math.round(selectedPlan.priceUSD * usdToInrRate);
        const res = await api.createGatewayOrder({
          amount: amt,
          plan_id: selectedPlan.id,
          customer_name: userName.trim() || undefined,
          customer_email: userEmail.trim() || undefined,
          payment_method: 'upi',
          redirect_url: '/design',
        });
        if (res?.data) {
          orderToVerify = res.data;
          setActiveOrder(res.data);
        }
      }

      if (!orderToVerify?.order_no) {
        throw new Error('Unable to initialize payment order. Please refresh and try again.');
      }

      const res = await api.verifyGatewayCode(orderToVerify.order_no, code);
      if (res?.success) {
        setInvoiceGenerated(true);
        setActiveOrder((prev) => (prev ? {
          ...prev,
          status: 'paid',
          invoice_generated: true,
          invoice_no: res.data?.invoice_no || (res as any)?.invoice_no,
          invoice_date: res.data?.invoice_date || (res as any)?.invoice_date || new Date().toISOString(),
          utr: res.data?.utr || 'UPI_RECEIVED',
        } : res.data));
        try {
          const me = await api.me();
          if (me?.user) setCurrentUser(me.user);
        } catch {}
      } else {
        setCodeSubmitError(res?.message || 'Invalid authorization code. Please verify and try again.');
      }
    } catch (err: any) {
      setCodeSubmitError(err?.message || 'Invalid authorization code. Please check and try again.');
    } finally {
      setVerifyingCode(false);
    }
  };

  const cleanPlanName = (selectedPlan?.name || 'Pro').replace(/[^a-zA-Z0-9]/g, '');
  // Official NPCI standard UPI link (clean parameters, no .00 suffix to ensure universal scanner compatibility)
  const upiPayLink = selectedPlan && qrMode === 'fixed'
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName).replace(/%20/g, '+')}&am=${inrAmount}&cu=INR&tn=ShivNaresh${cleanPlanName}`
    : `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName).replace(/%20/g, '+')}&cu=INR`;

  useEffect(() => {
    if (!upiPayLink) return;
    // High-resolution 400x400 PNG with official 4-module quiet zone & High error correction
    QRCode.toDataURL(upiPayLink, {
      width: 400,
      margin: 4,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        setLocalQrDataUrl(url);
      })
      .catch((err) => console.error('QR code generation error:', err));
  }, [upiPayLink]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2500);
  };

  return (
    <div className={`min-h-screen font-sans antialiased ${
      isLight ? 'bg-[#97c1a9] text-slate-900' : 'bg-[#070709] text-white'
    }`}>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            background: #ffffff !important;
            color: #111827 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-invoice, #printable-invoice * {
            visibility: visible !important;
          }
          #printable-invoice {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
            border: 1px solid #bbbbbb !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #111827 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      {/* Top Header */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
        isLight ? 'border-[#82b095] bg-[#97c1a9]/90' : 'border-white/10 bg-[#0a0a0f]/85'
      }`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5">
          <a href="/" className="flex items-center gap-2.5" title="Return to Home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5373f] text-xs font-semibold text-white">
              SN
            </span>
            <div className="flex flex-col">
              <span className={`text-sm font-semibold tracking-wider ${
                isLight ? 'text-gray-900' : 'text-white'
              }`}>
                Shiv-Naresh
              </span>
              <span className="text-[10px] font-medium text-[#e5373f] -mt-0.5">
                Studio
              </span>
            </div>
            <span className="rounded bg-[#e5373f]/10 border border-[#e5373f]/20 px-2 py-0.5 text-[10px] font-medium text-[#e5373f] hidden sm:inline-block ml-1">
              Pricing
            </span>
          </a>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={`rounded-lg border p-2 text-xs transition-colors ${
                isLight
                  ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                  : 'border-white/10 bg-white/5 text-white/70 hover:text-white'
              }`}
              title="Toggle theme"
            >
              {isLight ? 'Dark' : 'Light'}
            </button>
            <a
              href="/design"
              className="rounded-lg bg-[#e5373f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#d42d35] transition-colors"
            >
              Open Studio
            </a>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-18">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="text-xs font-medium text-[#e5373f] mb-3">
            Sportswear studio plans
          </p>
          <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight mb-4 ${
            isLight ? 'text-gray-900' : 'text-white'
          }`}>
            Plans for squad kits and seasonal collections
          </h1>
          <p className={`text-sm sm:text-base max-w-2xl mx-auto leading-relaxed opacity-75 ${
            isLight ? 'text-gray-700' : 'text-slate-300'
          }`}>
            High-resolution photorealistic photoshoot poses (1 photoshoot = 6 poses) and cinematic motion videos with commercial licensing.
          </p>
        </div>

        {/* Studio Policy Banner */}
        <div className={`max-w-4xl mx-auto mb-10 p-4 rounded-2xl border text-xs leading-relaxed flex items-center gap-3.5 ${
          isLight ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
        }`}>
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 shrink-0 flex items-center justify-center font-bold text-amber-500">
            !
          </div>
          <div>
            <span className="font-bold uppercase tracking-wider text-[11px] block">Generation & Photoshoot Quota Policy</span>
            <p className="mt-0.5 opacity-90">
              <strong>1 Photoshoot = 6 poses / images.</strong> Every generated pose or image (including wrong or test generations) is strictly counted in your quota. Users will strictly utilize what the studio administrator has allocated for their account. Please review garment photo guidelines before generating.
            </p>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-5 mb-16">
          {plansList.filter((p) => !p.deleted).map((plan) => {
            const inrPrice = plan.priceINR && plan.priceINR > 0 ? plan.priceINR : Math.round(plan.priceUSD * usdToInrRate);
            const userTier = currentUser?.tier || 'free';
            const isCurrentPlan = (userTier === plan.id) || (userTier === 'free' && plan.id === 'starter');
            const isUltraUser = userTier === 'ultra';
            const isDeactivated = plan.active === false;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 flex flex-col justify-between transition-colors border ${
                  isCurrentPlan
                    ? isLight
                      ? 'bg-emerald-50/40 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                      : 'bg-emerald-950/20 border-emerald-500/60 shadow-sm ring-1 ring-emerald-500/40'
                    : plan.featured
                      ? isLight
                        ? 'bg-white border-[#e5373f] shadow-sm ring-1 ring-[#e5373f]'
                        : 'bg-[#121217] border-[#e5373f]/60 shadow-sm ring-1 ring-[#e5373f]/40'
                      : isLight
                        ? 'bg-white border-gray-200 shadow-sm'
                        : 'bg-[#101014] border-white/10 shadow-sm'
                }`}
              >
                {isCurrentPlan ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white shadow">
                      ACTIVE PLAN
                    </span>
                  </div>
                ) : plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-[#e5373f] text-white">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xl font-bold tracking-wide mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>{plan.name}</h3>
                      {isDeactivated && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-bold uppercase">
                          Deactivated
                        </span>
                      )}
                    </div>
                    <p className={`text-xs min-h-[32px] leading-relaxed ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>{plan.tagline}</p>
                  </div>

                  {/* Price Block */}
                  <div className={`py-5 border-y mb-5 ${isLight ? 'border-gray-200' : 'border-slate-800/80'}`}>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-3xl sm:text-4xl font-extrabold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                        ${plan.priceUSD}
                      </span>
                      <span className={`text-xs font-semibold ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>/ month</span>
                    </div>
                    {plan.priceUSD > 0 ? (
                      <p className={`text-xs font-semibold mt-1 flex items-center gap-1 ${isLight ? 'text-amber-700' : 'text-amber-400/90'}`}>
                        ≈ ₹{inrPrice.toLocaleString('en-IN')} INR {plan.priceINR && plan.priceINR > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">Fixed INR</span> : <span className={isLight ? 'text-gray-400 font-normal' : 'text-slate-500 font-normal'}>(@ ₹{usdToInrRate}/USD live)</span>}
                      </p>
                    ) : (
                      <p className={`text-xs font-semibold mt-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>100% Free Signup Forever</p>
                    )}
                  </div>

                  {/* Simplified Specifications: Photoshoots, Videos, Credits ONLY */}
                  <div className={`space-y-2 mb-4 text-xs rounded-xl p-3.5 border ${
                    isLight ? 'bg-gray-50 border-gray-200 text-slate-800' : 'bg-black/40 border-white/10 text-slate-300'
                  }`}>
                    <div className="flex justify-between items-center py-0.5">
                      <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Photoshoots:</span>
                      <span className={`font-semibold text-right text-xs max-w-[60%] ${isLight ? 'text-gray-900' : 'text-slate-200'}`}>
                        {plan.specs.photoshoots || plan.specs.models}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-0.5">
                      <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Videos:</span>
                      <span className={`font-semibold text-right ${isLight ? 'text-gray-900' : 'text-slate-200'}`}>{plan.specs.videos}</span>
                    </div>
                    <div className="flex justify-between items-center py-0.5">
                      <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Credits:</span>
                      <span className={`font-bold text-right ${isLight ? 'text-[#e5373f]' : 'text-amber-400'}`}>{plan.specs.credits}</span>
                    </div>
                  </div>

                  {/* View More Features Toggle */}
                  <div className="mb-6">
                    <button
                      type="button"
                      onClick={() => setExpandedPlans((prev) => ({ ...prev, [plan.id]: !prev[plan.id] }))}
                      className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${
                        isLight
                          ? 'border-gray-200 bg-gray-100 hover:bg-gray-200 text-gray-700'
                          : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      <span>{expandedPlans[plan.id] ? 'Hide Features' : 'View More Features'}</span>
                      {expandedPlans[plan.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {expandedPlans[plan.id] && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2 text-xs">
                        <div className="flex justify-between items-center py-0.5">
                          <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Turnaround:</span>
                          <span className={`font-medium text-right ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{plan.specs.delivery}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className={isLight ? 'text-gray-500' : 'text-slate-400'}>Resolution:</span>
                          <span className={`font-medium text-right ${isLight ? 'text-gray-900' : 'text-slate-200'}`}>{plan.specs.resolution}</span>
                        </div>
                        <div className="pt-2 space-y-2">
                          <p className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>Full Specifications</p>
                          {plan.features.map((feat, idx) => (
                            <div key={idx} className={`flex items-start gap-2 text-xs leading-relaxed ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>
                              <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Call to action */}
                {isCurrentPlan ? (
                  <div className="w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-sm cursor-default">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span>Current Active Plan</span>
                  </div>
                ) : isDeactivated ? (
                  <div className="w-full py-3 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/25 text-red-400 cursor-not-allowed">
                    <X className="w-4 h-4 shrink-0 text-red-400" />
                    <span>Plan Deactivated</span>
                  </div>
                ) : isUltraUser ? (
                  <div className={`w-full py-3 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-2 border cursor-default ${
                    isLight ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-white/5 border-white/10 text-white/40'
                  }`}>
                    <span>Included in your Ultra tier</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleChoosePlan(plan)}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 ${plan.featured
                      ? 'bg-[#e5373f] text-white hover:bg-[#d42d35] shadow-lg shadow-[#e5373f]/25'
                      : plan.priceUSD === 0
                        ? isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200' : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                        : isLight ? 'bg-gray-900 text-white hover:bg-gray-800' : 'bg-white text-gray-900 hover:bg-gray-100'
                      }`}
                  >
                    {plan.priceUSD === 0 ? 'Start Free Forever' : `Pay ₹${inrPrice.toLocaleString('en-IN')}`}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Highlights */}
        <div className={`rounded-2xl border p-6 sm:p-8 mb-16 ${
          isLight ? 'bg-white border-gray-200 text-slate-900 shadow-sm' : 'bg-[#101014] border-white/10'
        }`}>
          <div className="max-w-2xl mb-6">
            <h3 className={`text-xl font-semibold mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>Studio specs & guarantees</h3>
            <p className={`text-xs ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>Engineered for athletic performance apparel, team jerseys, and technical fabrics.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className={`p-4 rounded-xl border ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#15151b] border-white/5'}`}>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 mb-3">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h4 className={`text-sm font-semibold mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>Custom order guarantee</h4>
              <p className={`text-xs leading-relaxed opacity-75`}>
                Bespoke and custom orders are fulfilled directly by our our studio team within 24 to 48 hours.
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#15151b] border-white/5'}`}>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 mb-3">
                <Zap className="w-4 h-4" />
              </div>
              <h4 className={`text-sm font-semibold mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>1-Hour grace window</h4>
              <p className={`text-xs leading-relaxed opacity-75`}>
                Uploaded an incorrect garment or asset? Edit or delete any order within 1 hour without credit deduction.
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-[#15151b] border-white/5'}`}>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 mb-3">
                <Building2 className="w-4 h-4" />
              </div>
              <h4 className={`text-sm font-semibold mb-1 ${isLight ? 'text-gray-900' : 'text-white'}`}>Commercial rights</h4>
              <p className={`text-xs leading-relaxed opacity-75`}>
                All output imagery and runway motion videos include unrestricted commercial rights for your e-commerce channels.
              </p>
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="text-center mb-10">
            <h3 className={`text-2xl font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>Frequently Asked Questions</h3>
            <p className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>Everything you need to know about billing, quotas, and support</p>
          </div>
          <div className="space-y-4">
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200 text-slate-900 shadow-sm' : 'bg-[#101014] border-white/10'}`}>
              <h4 className={`text-sm font-semibold mb-1 flex items-center gap-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                <HelpCircle className="w-4 h-4 text-[#e5373f]" />
                How are plans activated after payment?
              </h4>
              <p className={`text-xs leading-relaxed pl-6 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
                After completing the UPI payment via QR code, enter your 12-digit UTR / Transaction ID and click "Submit & Send on WhatsApp". Our administration team verifies the transaction and manually activates your plan quotas and credits within 30 minutes.
              </p>
            </div>
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200 text-slate-900 shadow-sm' : 'bg-[#101014] border-white/10'}`}>
              <h4 className={`text-sm font-semibold mb-1 flex items-center gap-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                <HelpCircle className="w-4 h-4 text-[#e5373f]" />
                What is the refund policy?
              </h4>
              <p className={`text-xs leading-relaxed pl-6 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
                We operate a strict No-Refund policy once credits or computational quotas are provisioned. However, because our infrastructure relies on third-party GPU clusters, if any system outage occurs during your billing month, our dedicated support team will manually fulfill every single try-on and video generation for you.
              </p>
            </div>
            <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200 text-slate-900 shadow-sm' : 'bg-[#101014] border-white/10'}`}>
              <h4 className={`text-sm font-semibold mb-1 flex items-center gap-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>
                <HelpCircle className="w-4 h-4 text-[#e5373f]" />
                Do unused credits expire?
              </h4>
              <p className={`text-xs leading-relaxed pl-6 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
                Yes, monthly plan credits (200 on On-Demand, 500 on Pro, 100 on Ultra) expire at the end of each 30-day billing cycle to maintain high-throughput cluster availability for all active atelier members.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Terms & Conditions Agreement */}
      {showTermsModal && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className={`border rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative ${
            isLight ? 'bg-white border-gray-200 text-slate-900' : 'bg-[#101014] border-white/10 text-white'
          }`}>
            <button
              onClick={() => setShowTermsModal(false)}
              className={`absolute top-5 right-5 p-1 rounded-lg ${
                isLight ? 'text-gray-400 hover:text-gray-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-[#e5373f]/10 border border-[#e5373f]/20 flex items-center justify-center text-[#e5373f] mb-4">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>Terms & Conditions Agreement</h3>
            <p className={`text-xs leading-relaxed mb-4 ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
              Before activating the <span className="font-semibold text-[#e5373f]">{selectedPlan.name}</span> (${selectedPlan.priceUSD} / ≈ ₹{Math.round(selectedPlan.priceUSD * usdToInrRate).toLocaleString('en-IN')}), please review our official platform policies:
            </p>
            <div className={`rounded-xl p-4 border text-xs space-y-2 mb-6 ${
              isLight ? 'bg-gray-50 border-gray-200 text-slate-800' : 'bg-black/40 border-white/10 text-slate-300'
            }`}>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Strict No-Refund Policy:</strong> All subscription purchases are final upon provisioning.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Photoshoot & Generation Rule:</strong> 1 photoshoot = 6 poses/images. All generated poses (including test or imperfect generations) count toward your quota. Admin-set photoshoot allocations apply.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Third-Party System Clause:</strong> If external neural clusters face outages, our support team will manually fulfill all your try-on and video quotas for that billing month.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>30-Day Expiry:</strong> Unused credits expire at the end of each billing cycle.</span>
              </div>
            </div>
            <p className={`text-xs mb-6 ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>
              Read complete details in our{' '}
              <a href="/terms" target="_blank" className="text-amber-500 underline inline-flex items-center gap-1 font-semibold">
                Terms and Conditions <ExternalLink className="w-3 h-3" />
              </a>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTermsModal(false)}
                className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider ${
                  isLight ? 'border-gray-300 hover:bg-gray-100 text-gray-700' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleAgreeTerms}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black text-xs font-bold uppercase tracking-wider shadow-lg shadow-amber-500/20"
              >
                I Agree & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified Checkout Modal (Fixed Amount QR, UPI ID, Code 1450903 Unlock & Generate Invoice) */}
      {showCheckoutModal && selectedPlan && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/90 backdrop-blur-md flex justify-center items-start sm:items-center p-3 sm:p-4">
          <div className={`relative w-full max-w-lg rounded-2xl border p-5 sm:p-6 shadow-2xl my-4 sm:my-8 max-h-[92vh] flex flex-col ${
            isLight ? 'bg-white text-slate-900 border-gray-200' : 'bg-[#0f1117] text-white border-white/10'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>{invoiceGenerated || activeOrder?.status === 'paid' ? 'Tax Invoice & Plan Activated' : 'Plan Checkout'}</span>
              </span>
              <button
                onClick={() => {
                  setShowCheckoutModal(false);
                  setVerificationCode('');
                  setCodeSubmitError('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto pr-1.5 pt-3 space-y-4 flex-1">
              {/* STATE A: INVOICE GENERATED & PLAN ACTIVATED */}
              {invoiceGenerated || activeOrder?.status === 'paid' ? (
                <div className="py-2 space-y-4">
                  <div className="text-center space-y-1 no-print">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-500/40">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h3 className={`text-lg font-extrabold ${isLight ? 'text-gray-900' : 'text-white'}`}>
                      Invoice Generated & Plan Activated!
                    </h3>
                    <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider">
                      {selectedPlan.name} is now active on your account
                    </p>
                  </div>

                  {/* Printable Invoice Container Matching Official PDF */}
                  <div id="printable-invoice" className="bg-white text-gray-900 p-6 sm:p-8 rounded-2xl shadow-xl max-w-2xl mx-auto font-sans border border-[#bbbbbb]">
                    {/* Header */}
                    <div className="flex justify-between items-end border-b-2 border-[#1F3A5F] pb-4">
                      <div>
                        <h1 className="text-3xl font-black tracking-tight text-[#1F3A5F]">INVOICE</h1>
                      </div>
                      <div className="text-right text-xs space-y-1">
                        <div>
                          <span className="font-semibold text-gray-500">Invoice No:</span>{' '}
                          <span className="font-mono font-bold text-gray-900">{activeOrder?.invoice_no || '1450903'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-500">Date:</span>{' '}
                          <span className="font-medium text-gray-900">
                            {activeOrder?.invoice_date
                              ? new Date(activeOrder.invoice_date).toLocaleDateString('en-GB')
                              : new Date().toLocaleDateString('en-GB')}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-500">Status:</span>{' '}
                          <span className="font-bold text-[#1B7F3B] uppercase tracking-wide">PAID</span>
                        </div>
                      </div>
                    </div>

                    {/* From / Bill To */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-5 text-xs">
                      <div>
                        <p className="font-bold uppercase tracking-wider text-[#1F3A5F] text-[11px] mb-2">FROM (SELLER)</p>
                        <p className="font-bold text-sm text-gray-900">Pawan Kumar</p>
                        <p className="text-gray-600">Photo & Video Shoot Services</p>
                        <p className="text-gray-600">256, Gali No. 5, Tukmirpur Ext,</p>
                        <p className="text-gray-600">Karawal Nagar, Delhi - 110094</p>
                      </div>
                      <div>
                        <p className="font-bold uppercase tracking-wider text-[#1F3A5F] text-[11px] mb-2">BILL TO</p>
                        <p className="font-bold text-sm text-gray-900">{userName.trim() || 'Shiv-Naresh Sports Private Limited'}</p>
                        <p className="text-gray-600">E-23, Karampura,</p>
                        <p className="text-gray-600">New Delhi - 110015</p>
                        <p className="text-gray-500 font-mono text-[11px] mt-1">CIN: U18109DL1998PTC097659</p>
                      </div>
                    </div>

                    {/* Table with #1F3A5F Header & 1px borders */}
                    <div className="mt-2 overflow-hidden rounded border border-[#bbbbbb]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#1F3A5F] text-white">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center border border-[#bbbbbb] font-bold">#</th>
                            <th className="py-2.5 px-4 border border-[#bbbbbb] font-bold">Description</th>
                            <th className="py-2.5 px-3 text-center w-14 border border-[#bbbbbb] font-bold">Qty</th>
                            <th className="py-2.5 px-4 text-right w-36 border border-[#bbbbbb] font-bold">Amount (INR)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="py-3.5 px-3 text-center font-bold text-gray-700 align-top border border-[#bbbbbb]">1</td>
                            <td className="py-3.5 px-4 align-top border border-[#bbbbbb]">
                              <p className="font-bold text-gray-900">Photo & Video Shoot Services</p>
                              <p className="text-gray-600 mt-1">- {selectedPlan.specs.photoshoots} photo shoots (each shoot = 5 poses)</p>
                              <p className="text-gray-600">- {selectedPlan.specs.videos} in 1080p, each 5 to 10 seconds long</p>
                            </td>
                            <td className="py-3.5 px-3 text-center font-medium text-gray-700 align-top border border-[#bbbbbb]">1</td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold text-gray-900 align-top border border-[#bbbbbb]">
                              {(activeOrder?.amount || inrAmount).toLocaleString('en-IN')}.00
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end mt-4">
                      <div className="w-full sm:w-64 text-xs space-y-1">
                        <div className="flex justify-between text-gray-600">
                          <span>Subtotal</span>
                          <span className="font-mono">INR {(activeOrder?.amount || inrAmount).toLocaleString('en-IN')}.00</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>GST</span>
                          <span>Not applicable</span>
                        </div>
                        <div className="flex justify-between py-1 px-2 bg-[#EEF2F8] rounded font-bold text-gray-900 border-t-[1.5px] border-[#1F3A5F]">
                          <span>Total</span>
                          <span className="font-mono">INR {(activeOrder?.amount || inrAmount).toLocaleString('en-IN')}.00</span>
                        </div>
                        <div className="flex justify-between text-gray-600 px-2">
                          <span>Amount Paid</span>
                          <span className="font-mono">INR {(activeOrder?.amount || inrAmount).toLocaleString('en-IN')}.00</span>
                        </div>
                        <div className="flex justify-between font-semibold text-gray-900 px-2">
                          <span>Balance Due</span>
                          <span className="font-mono">INR 0.00</span>
                        </div>
                      </div>
                    </div>

                    {/* Amount in words */}
                    <div className="mt-3 pt-2.5 border-t border-gray-200 text-xs">
                      <span className="font-bold text-gray-900">Amount in words:</span>{' '}
                      <span className="text-gray-700 italic">{numberToWordsINR(activeOrder?.amount || inrAmount)}</span>
                    </div>

                    {/* Payment details Box */}
                    <div className="mt-4 rounded border border-[#bbbbbb] overflow-hidden text-xs">
                      <div className="bg-[#EEF2F8] border-b border-[#bbbbbb] py-1.5 px-3">
                        <p className="font-bold uppercase tracking-wider text-[#1F3A5F] text-[10.5px]">PAYMENT DETAILS</p>
                      </div>
                      <div className="p-3 space-y-0.5 text-gray-700">
                        <p><span className="font-semibold text-gray-900">Payment method:</span> UPI</p>
                        <p><span className="font-semibold text-gray-900">UPI ID:</span> <span className="font-mono">{upiId}</span></p>
                        <p><span className="font-semibold text-gray-900">Status:</span> Received in full</p>
                      </div>
                    </div>

                    {/* Footer notes */}
                    <div className="mt-4 text-[11px] text-gray-500 space-y-1 text-center sm:text-left">
                      <p><strong className="text-gray-700">Notes:</strong> The seller is not registered under GST; no GST has been charged on this invoice.</p>
                      <p className="text-center font-medium text-gray-600 mt-3">Thank you for your business.</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2 pt-2 no-print">
                    <button
                      type="button"
                      onClick={() => printInvoiceDocument(activeOrder, selectedPlan, userName, inrAmount, upiId)}
                      className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                        isLight ? 'border-gray-300 hover:bg-gray-100 text-gray-800' : 'border-white/15 hover:bg-white/10 text-white'
                      }`}
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print / Save PDF Invoice (1 Page A4)</span>
                    </button>
                    <a
                      href="/design"
                      className="w-full py-3 px-4 rounded-xl bg-[#e5373f] hover:bg-[#d42d35] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-[#e5373f]/25 cursor-pointer"
                    >
                      <span>Go to Studio</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ) : (
                /* STATE B: SCAN FIXED QR + ENTER CODE TO GENERATE INVOICE */
                <div className="space-y-4">
                  {/* Plan Price Banner */}
                  <div className={`p-3 rounded-2xl border flex items-center justify-between ${
                    isLight ? 'bg-amber-50 border-amber-200' : 'bg-slate-900/90 border-amber-500/30'
                  }`}>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 block">Selected Plan</span>
                      <h4 className="text-base font-extrabold text-amber-500">{selectedPlan.name}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-amber-500">₹{inrAmount.toLocaleString('en-IN')}</span>
                      <span className="block text-[10px] font-bold text-emerald-400">Fixed Exact Amount</span>
                    </div>
                  </div>

                  {orderLoading ? (
                    <div className="py-12 text-center space-y-3">
                      <Loader2 className="w-7 h-7 animate-spin text-amber-500 mx-auto" />
                      <p className="text-xs text-slate-400 font-semibold">Generating fixed amount QR code...</p>
                    </div>
                  ) : (
                    /* FIXED AMOUNT QR CODE & UPI ID */
                    <div className="space-y-3">
                      <div className="bg-[#111726] border border-amber-500/30 p-3.5 sm:p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center mx-auto text-center w-full">
                        <div className="bg-white p-2 rounded-2xl shadow-md inline-block">
                          {activeOrder?.qr_data_url || localQrDataUrl ? (
                            <img
                              src={activeOrder?.qr_data_url || localQrDataUrl}
                              alt={`Scan to Pay ₹${inrAmount}`}
                              className="w-48 h-48 sm:w-56 sm:h-56 object-contain block mx-auto rounded"
                            />
                          ) : (
                            <div className="w-48 h-48 sm:w-56 sm:h-56 flex flex-col items-center justify-center bg-slate-100 rounded text-xs text-slate-500">
                              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-amber-500 mb-2" />
                              Generating High-Res UPI QR...
                            </div>
                          )}
                        </div>

                        <div className="mt-3 text-center w-full">
                          <p className="text-xs sm:text-sm font-extrabold text-white">{payeeName} &middot; PhonePe UPI</p>
                          <p className="text-xs font-mono text-amber-400 font-bold tracking-wider mt-0.5">{upiId}</p>
                          <span className="inline-block mt-1.5 text-xs font-black text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-3 py-0.5 rounded-full">
                            Fixed ₹{inrAmount.toLocaleString('en-IN')} (Non-editable)
                          </span>
                        </div>
                      </div>

                      {/* Supported Apps Badge */}
                      <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
                        <span>PhonePe</span> &middot;
                        <span>Google Pay</span> &middot;
                        <span>Paytm</span> &middot;
                        <span>BHIM</span> &middot;
                        <span>Any UPI App</span>
                      </div>

                      {/* 1-Tap Mobile UPI Intent Link */}
                      <a
                        href={activeOrder?.upi_intent || upiPayLink}
                        className="block w-full py-2.5 px-3 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-center font-semibold text-xs transition cursor-pointer"
                      >
                        Pay via mobile UPI app (PhonePe / GPay / Paytm)
                      </a>

                      {/* UPI ID Copy Card */}
                      <div className={`flex items-center justify-between rounded-xl border p-2.5 ${
                        isLight ? 'bg-gray-100 border-gray-300 text-slate-900' : 'bg-slate-950 border-slate-800'
                      }`}>
                        <div className="text-left">
                          <span className={`text-[10px] uppercase font-bold block ${isLight ? 'text-gray-500' : 'text-slate-500'}`}>Payee UPI ID:</span>
                          <span className="text-xs font-mono font-bold text-amber-500 select-all">{upiId}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyUpi}
                          className="py-1 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition active:scale-95 cursor-pointer flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedUpi ? 'Copied' : 'Copy UPI'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* AUTHORIZATION CODE SUBMIT & GENERATE INVOICE OPTION */}
                  <div className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-amber-50/80 border-amber-200' : 'bg-slate-950/80 border-amber-500/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                        Generate Invoice
                      </span>
                    </div>
                    <p className={`text-xs mb-3 leading-relaxed ${isLight ? 'text-gray-600' : 'text-slate-300'}`}>
                      After payment, enter the authorization code you received to generate your invoice and activate the plan.
                    </p>

                    <div className="space-y-2">
                      <input
                        type="password"
                        maxLength={20}
                        value={verificationCode}
                        onChange={(e) => {
                          setVerificationCode(e.target.value);
                          setCodeSubmitError('');
                        }}
                        placeholder="Enter Authorization Code"
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-center font-mono text-sm font-bold tracking-widest outline-none transition-colors ${
                          isLight
                            ? 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-[#e5373f]'
                            : 'bg-black/70 border-white/20 text-white placeholder:text-slate-500 focus:border-amber-400'
                        }`}
                      />

                      {codeSubmitError && (
                        <p className="text-xs text-red-400 font-semibold text-center">{codeSubmitError}</p>
                      )}

                      <button
                        type="button"
                        disabled={!verificationCode.trim() || verifyingCode}
                        onClick={handleVerifyCode}
                        className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          verificationCode.trim().length > 0
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                            : 'bg-white/10 text-white/40 cursor-not-allowed border border-white/10'
                        }`}
                      >
                        {verifyingCode ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Verifying & Generating Invoice...</span>
                          </>
                        ) : verificationCode.trim().length > 0 ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Generate Invoice & Activate {selectedPlan.name} Plan</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>Enter Code to Generate Invoice</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Collapsible SBI Bank Transfer Alternative */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowBankDetails(!showBankDetails)}
                      className="w-full py-1.5 text-center text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      {showBankDetails ? 'Hide Bank Details' : 'Prefer direct bank transfer instead? Click here'}
                    </button>

                    {showBankDetails && (
                      <div className={`mt-2 rounded-2xl border p-4 text-xs space-y-2 ${
                        isLight ? 'bg-gray-100 border-gray-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                      }`}>
                        <div className="flex items-center gap-2 pb-1 border-b border-white/10 text-amber-500 font-bold uppercase tracking-wider text-[11px]">
                          <Building2 className="w-3.5 h-3.5" />
                          <span>State Bank of India (SBI)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-60">Beneficiary:</span>
                          <span className="font-bold">{bankDetails.accountHolder}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-60">A/C Number:</span>
                          <span className="font-mono font-bold text-amber-400 select-all">{bankDetails.accountNumber}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-60">IFSC Code:</span>
                          <span className="font-mono font-bold text-emerald-400 select-all">{bankDetails.ifsc}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-60">Amount:</span>
                          <span className="font-bold">₹{inrAmount.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Support WhatsApp Link */}
                  <div className={`pt-2 border-t text-center ${isLight ? 'border-gray-200' : 'border-slate-800'}`}>
                    <a
                      href={`https://api.whatsapp.com/send/?phone=916398743132&text=${encodeURIComponent(`Hello Pawan Kumar, I am subscribing to the ${selectedPlan.name} plan on Shiv-Naresh AI Studio.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium inline-flex items-center gap-1.5"
                    >
                      <MessageSquare size={13} /> Questions? Chat with Pawan Kumar on WhatsApp (+91 6398743132)
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

            {/* Modal 3: Fullscreen Enlarged QR Modal */}
      {showEnlargedQr && (
        <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0c1017] border-2 border-amber-500/60 p-6 rounded-3xl max-w-sm w-full text-center shadow-2xl relative">
            <button
              onClick={() => setShowEnlargedQr(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="text-base font-bold text-white mb-2">Scan & Pay via UPI</h4>
            <p className="text-xs text-slate-400 mb-3">{selectedPlan?.name} Plan &middot; PAWAN KUMAR</p>
            <div className="bg-white p-3 rounded-2xl shadow-xl inline-block mb-3">
              <img src={localQrDataUrl} alt="Enlarged UPI QR" className="w-64 h-64 sm:w-72 sm:h-72 object-contain mx-auto" />
            </div>
            <p className="text-xs font-mono text-amber-400 font-bold">{upiId}</p>
            <p className="text-sm font-black text-emerald-400 mt-1">₹{inrAmount.toLocaleString('en-IN')}</p>
            <button
              onClick={() => setShowEnlargedQr(false)}
              className="mt-4 w-full py-2.5 rounded-xl bg-amber-500 text-black font-bold text-xs uppercase cursor-pointer hover:bg-amber-400"
            >
              Close Fullscreen View
            </button>
          </div>
        </div>
      )}

      {/* Embedded Global Luxury Footer */}
      <SiteFooter />
    </div>
  );
}
