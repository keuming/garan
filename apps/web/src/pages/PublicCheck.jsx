import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api.js';
import { ErrorBox, Field, Wordmark } from '../components/ui.jsx';
import { LABELS } from '../format.js';

/** Page publique : vÃ©rifier un IMEI avant d'acheter, ou dÃ©clarer un vol / une perte. */
export function PublicCheck() {
  const [imei, setImei] = useState('');
  const check = useMutation({ mutationFn: (v) => api.public(`/public/imei/${v}`) });

  // QR code d un certificat gaRAN : /verifier?imei=... -> pre-remplit et verifie automatiquement.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('imei');
      if (q) {
        const v = q.replace(/\D/g, '');
        if (v) { setImei(v); if (v.length >= 14) check.mutate(v); }
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState({ imei: '', kind: 'stolen', reporter_name: '', reporter_phone: '', id_doc_type: 'CNI', id_doc_number: '', police_report_number: '', description: '' });
  const report = useMutation({ mutationFn: () => api.public('/public/theft-reports', { method: 'POST', body: form }) });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const verdictTone = { clean: 'ok', reported: 'danger', unknown: 'info' };

  return (
    <div className="public">
      <header>
        <img src="/garan-icone-192.png" alt="" />
        <div>
          <Wordmark style={{ fontSize: 28 }} />
          <div className="muted small">Registre digital des tÃ©lÃ©phones Â· IMEI</div>
        </div>
      </header>

      <form className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={(e) => { e.preventDefault(); check.mutate(imei.replace(/\D/g, '')); }}>
        <h2>VÃ©rifier un tÃ©lÃ©phone avant de lâ€™acheter</h2>
        <p className="muted small" style={{ margin: 0 }}>Composez *#06# sur le tÃ©lÃ©phone pour afficher son IMEI.</p>
        <Field label="IMEI (15 chiffres)" id="imei">
          <input id="imei" className="input mono" inputMode="numeric" maxLength={20} required value={imei} onChange={(e) => setImei(e.target.value)} />
        </Field>
        <button className="btn" type="submit" disabled={check.isPending}>VÃ©rifier</button>
        <ErrorBox error={check.error} />
        {check.data ? (
          <div className={`verdict ${verdictTone[check.data.result]}`}>
            <div>
              <strong>{check.data.brand ? `${check.data.brand} ${check.data.model ?? ''}` : check.data.imei}</strong>
              {check.data.message}
            </div>
          </div>
        ) : null}
      </form>

      <form className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={(e) => { e.preventDefault(); report.mutate(); }}>
        <h2>DÃ©clarer un vol ou une perte</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Si vous Ãªtes le propriÃ©taire enregistrÃ©, la dÃ©claration est appliquÃ©e immÃ©diatement. Sinon, elle est vÃ©rifiÃ©e par notre Ã©quipe.
        </p>
        {report.data ? (
          <div className="alert success">{report.data.message} RÃ©fÃ©rence : <span className="mono">{report.data.reference.slice(0, 8)}</span></div>
        ) : (
          <>
            <ErrorBox error={report.error} />
            <div className="form-row">
              <Field label="IMEI" id="r-imei"><input id="r-imei" className="input mono" inputMode="numeric" required value={form.imei} onChange={set('imei')} /></Field>
              <Field label="Type" id="r-kind">
                <select id="r-kind" className="input" value={form.kind} onChange={set('kind')}>
                  <option value="stolen">Vol</option>
                  <option value="lost">Perte</option>
                </select>
              </Field>
            </div>
            <div className="form-row">
              <Field label="Nom complet" id="r-name"><input id="r-name" className="input" required value={form.reporter_name} onChange={set('reporter_name')} /></Field>
              <Field label="TÃ©lÃ©phone de contact" id="r-phone"><input id="r-phone" className="input" type="tel" required value={form.reporter_phone} onChange={set('reporter_phone')} /></Field>
            </div>
            <div className="form-row">
              <Field label="PiÃ¨ce dâ€™identitÃ©" id="r-doc">
                <select id="r-doc" className="input" value={form.id_doc_type} onChange={set('id_doc_type')}>
                  {Object.entries(LABELS.docType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="NumÃ©ro de la piÃ¨ce" id="r-docn"><input id="r-docn" className="input" required value={form.id_doc_number} onChange={set('id_doc_number')} /></Field>
            </div>
            <Field label="NÂ° de plainte / procÃ¨s-verbal (si disponible)" id="r-pv"><input id="r-pv" className="input" value={form.police_report_number} onChange={set('police_report_number')} /></Field>
            <Field label="Circonstances" id="r-desc"><textarea id="r-desc" className="input" rows={3} value={form.description} onChange={set('description')} /></Field>
            <button className="btn danger" type="submit" disabled={report.isPending}>Envoyer la dÃ©claration</button>
          </>
        )}
      </form>
    </div>
  );
}
