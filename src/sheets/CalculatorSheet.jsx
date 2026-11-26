import { useState, useEffect, useMemo } from 'react';
import { fmtINR } from '../lib/money';
import { Sheet } from '../ui/primitives';

export function CalculatorSheet({ open, onClose }) {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);   // previous operand (number) or null
  const [op, setOp] = useState(null);       // pending operator: +, -, ×, ÷
  const [justComputed, setJustComputed] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplay('0'); setPrev(null); setOp(null); setJustComputed(false);
    }
  }, [open]);

  const compute = (a, b, operator) => {
    switch (operator) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? null : a / b;
      default: return b;
    }
  };

  const pressDigit = (d) => {
    if (justComputed) {
      setDisplay(d);
      setJustComputed(false);
      return;
    }
    setDisplay((cur) => (cur === '0' ? d : cur + d));
  };
  const pressDot = () => {
    if (justComputed) { setDisplay('0.'); setJustComputed(false); return; }
    setDisplay((cur) => cur.includes('.') ? cur : cur + '.');
  };
  const pressOp = (next) => {
    const current = Number(display);
    if (prev != null && op && !justComputed) {
      const result = compute(prev, current, op);
      if (result == null) { setDisplay('Error'); setPrev(null); setOp(null); return; }
      setDisplay(formatNum(result));
      setPrev(result);
    } else {
      setPrev(current);
    }
    setOp(next);
    setJustComputed(true);
  };
  const pressEquals = () => {
    if (prev == null || op == null) return;
    const current = Number(display);
    const result = compute(prev, current, op);
    if (result == null) { setDisplay('Error'); setPrev(null); setOp(null); return; }
    setDisplay(formatNum(result));
    setPrev(null);
    setOp(null);
    setJustComputed(true);
  };
  const pressClear = () => { setDisplay('0'); setPrev(null); setOp(null); setJustComputed(false); };
  const pressBack = () => {
    if (justComputed || display === 'Error') { pressClear(); return; }
    setDisplay((cur) => cur.length <= 1 ? '0' : cur.slice(0, -1));
  };
  const pressSign = () => {
    if (display === '0' || display === 'Error') return;
    setDisplay((cur) => cur.startsWith('-') ? cur.slice(1) : '-' + cur);
  };

  const formatNum = (n) => {
    if (!isFinite(n)) return 'Error';
    // Trim trailing zeros, max 8 decimals
    const s = (Math.round(n * 1e8) / 1e8).toString();
    return s;
  };

  // Pretty INR-style preview under the raw number
  const previewINR = useMemo(() => {
    const n = Number(display);
    if (!isFinite(n) || display === 'Error') return '';
    return fmtINR(n, true);
  }, [display]);

  const btnStyle = (variant) => ({
    height: 56,
    borderRadius: 14,
    fontFamily: 'Inter', fontWeight: 700, fontSize: 18,
    background: variant === 'op' ? 'rgb(var(--accent-rgb) / .1)' :
                variant === 'eq' ? 'var(--primary)' :
                variant === 'fn' ? 'var(--surface-2)' :
                'var(--surface)',
    color: variant === 'eq' ? 'var(--on-cta)' :
           variant === 'op' ? 'var(--primary)' :
           'var(--text)',
    border: '1px solid ' + (variant === 'op' ? 'rgb(var(--accent-rgb) / .25)' : 'var(--border)'),
    transition: 'transform .08s ease, background .15s ease',
  });

  const Btn = ({ children, onClick, variant }) => (
    <button
      type="button"
      onClick={onClick}
      style={btnStyle(variant)}
      onTouchStart={(e) => { e.currentTarget.style.transform = 'scale(.96)'; }}
      onTouchEnd={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >{children}</button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Calculator">
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-3)',
        padding: '20px 18px',
        marginBottom: 16,
        textAlign: 'right',
      }}>
        <div style={{
          fontFamily: 'Inter', fontWeight: 500, fontSize: 12,
          color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.08em',
          minHeight: 16,
        }}>
          {prev != null && op ? `${formatNum(prev)} ${op}` : ' '}
        </div>
        <div style={{
          fontFamily: 'Inter', fontWeight: 800,
          // Fluid so long results shrink instead of wrapping mid-number.
          fontSize: 'clamp(30px, 9vw, 42px)', letterSpacing: '-.03em',
          color: display === 'Error' ? 'var(--negative)' : 'var(--text)',
          wordBreak: 'break-all',
          lineHeight: 1.1,
        }}>{display}</div>
        {display !== 'Error' && Number(display) !== 0 && (
          <div style={{
            fontFamily: 'Inter', fontWeight: 500, fontSize: 12,
            color: 'var(--primary)', marginTop: 4,
          }}>{previewINR}</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <Btn variant="fn" onClick={pressClear}>AC</Btn>
        <Btn variant="fn" onClick={pressSign}>±</Btn>
        <Btn variant="fn" onClick={pressBack}>⌫</Btn>
        <Btn variant="op" onClick={() => pressOp('÷')}>÷</Btn>

        <Btn onClick={() => pressDigit('7')}>7</Btn>
        <Btn onClick={() => pressDigit('8')}>8</Btn>
        <Btn onClick={() => pressDigit('9')}>9</Btn>
        <Btn variant="op" onClick={() => pressOp('×')}>×</Btn>

        <Btn onClick={() => pressDigit('4')}>4</Btn>
        <Btn onClick={() => pressDigit('5')}>5</Btn>
        <Btn onClick={() => pressDigit('6')}>6</Btn>
        <Btn variant="op" onClick={() => pressOp('−')}>−</Btn>

        <Btn onClick={() => pressDigit('1')}>1</Btn>
        <Btn onClick={() => pressDigit('2')}>2</Btn>
        <Btn onClick={() => pressDigit('3')}>3</Btn>
        <Btn variant="op" onClick={() => pressOp('+')}>+</Btn>

        <button
          type="button"
          onClick={() => pressDigit('0')}
          style={{ ...btnStyle(), gridColumn: 'span 2' }}
        >0</button>
        <Btn onClick={pressDot}>.</Btn>
        <Btn variant="eq" onClick={pressEquals}>=</Btn>
      </div>

      <p style={{ color: 'var(--text-mute)', fontSize: 11, textAlign: 'center', marginTop: 14 }}>
        Quick math while splitting bills. Result auto-formats in ₹.
      </p>
    </Sheet>
  );
}
