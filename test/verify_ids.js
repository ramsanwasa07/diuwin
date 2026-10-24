const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const ids = [
  'confirmWithdrawBtn',
  'withdrawReqSummary',
  'withdrawSubmitHint',
  'chkKyc',
  'chkDest',
  'chkAmt',
  'chkOtp',
  'withdrawAmountInput',
  'withdrawUpiInput',
  'withdrawBankHolder',
  'withdrawBankAcc',
  'withdrawBankAccConfirm',
  'withdrawBankIfsc',
  'withdrawBankName',
  'withdrawOtherAddress',
  'withdrawOtherHolder',
  'withdrawOtpInput',
  'withdrawPinInput',
  'btnSendWithdrawOtp',
  'withdrawOtpMsg',
  'otpSmsBanner',
  'otpSmsCode',
  'btnAutoFillOtp',
  'btnCopyOtpCode',
  'closeOtpSmsBanner',
  'kycModal',
  'kycModalClose',
  'withdrawKycBadge',
  'withdrawKycBanner',
  'btnKycAadhaar',
  'btnKycPan',
  'kycDocNumLabel',
  'kycDocNumber',
  'kycFullName',
  'kycDob',
  'kycState',
  'btnSubmitKyc',
  'inlineKycPanel',
  'btnCloseInlineKyc',
  'btnInlineKycAadhaar',
  'btnInlineKycPan',
  'inlineKycDocNumLabel',
  'inlineKycDocNumber',
  'inlineKycFullName',
  'inlineKycDob',
  'inlineKycState',
  'btnSubmitInlineKyc'
];

let missing = 0;
ids.forEach(id => {
  const match = html.includes('id="' + id + '"') || html.includes("id='" + id + "'");
  if (!match) {
    console.error('❌ Missing ID:', id);
    missing++;
  } else {
    console.log('✓ Found ID:', id);
  }
});

if (missing === 0) {
  console.log('\n🎉 ALL 37 REQUIRED DOM IDS ARE 100% PRESENT IN INDEX.HTML!');
} else {
  console.error('\n❌ Missing', missing, 'IDs');
  process.exit(1);
}
