import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Banner, Button, Card, ErrorBanner, Loading, Muted, Row, Screen, Title } from '../../../src/components/ui';
import { api } from '../../../src/lib/api';
import { dateTime, fcfa, LABELS } from '../../../src/lib/format';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function receiptHtml(t, qrSvg) {
  const who = t.type === 'sale' ? 'Acheteur' : 'Vendeur';
  const rows = [
    ['Opération', LABELS.txType[t.type]],
    ['Date', dateTime(t.occurred_at)],
    ['Téléphone', `${t.device.brand ?? ''} ${t.device.model ?? ''}`],
    ['IMEI 1', t.device.imei1],
    ...(t.device.imei2 ? [['IMEI 2', t.device.imei2]] : []),
    ['État', LABELS.condition[t.condition]],
    ['Montant', fcfa(t.price)],
    ...(t.person
      ? [
          [who, t.person.full_name],
          ['Pièce', `${LABELS.docType[t.person.id_doc_type] ?? t.person.id_doc_type} ${t.person.id_doc_number}`],
          ['Contacts', `${t.person.phone1} / ${t.person.phone2}`]
        ]
      : []),
    ['Enregistré par', t.recorded_by]
  ];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0A1F44;padding:28px;font-size:13px}
    .brand{font-size:30px;letter-spacing:-1px}.ga{font-weight:500}.ran{font-weight:800;color:#1463F3}
    h1{font-size:18px;margin:16px 0 4px}.muted{color:#4A5878}
    table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:7px 0;border-bottom:1px solid #E1E7F2}
    td:first-child{color:#4A5878;width:38%}td:last-child{font-weight:600}
    .qr{display:flex;gap:16px;align-items:center;margin-top:20px;border:1px solid #E1E7F2;border-radius:12px;padding:12px}
    .qr svg{width:120px;height:120px}
  </style></head><body>
  <div class="brand"><span class="ga">ga</span><span class="ran">RAN</span></div>
  <div class="muted">Registre digital des téléphones · IMEI</div>
  <h1>${t.type === 'sale' ? 'Reçu de vente et certificat de propriété' : `Reçu — ${esc(LABELS.txType[t.type])}`}</h1>
  <div class="muted">N° ${esc(t.receipt_number)}</div>
  <p><strong>${esc(t.shop.name)}</strong><br>${esc(t.shop.city)}, ${esc(t.shop.district)} · ${esc(t.shop.phone)}${t.shop.rccm ? ` · RCCM ${esc(t.shop.rccm)}` : ''}</p>
  <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
  ${t.type === 'sale' ? `<div class="qr">${qrSvg}<div><strong>Preuve de propriété</strong><br><span class="muted">Scannez ce code ou ouvrez ${esc(t.certificate_url)} pour vérifier que ce téléphone vous appartient, même sans le carton.</span></div></div>` : ''}
  </body></html>`;
}

export default function Receipt() {
  const { id } = useLocalSearchParams();
  const { data: t, error, isLoading } = useQuery({ queryKey: ['transaction', id], queryFn: () => api.get(`/transactions/${id}`) });
  const [qr, setQr] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(null);

  useEffect(() => {
    if (t?.certificate_url) QRCode.toString(t.certificate_url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null));
  }, [t?.certificate_url]);

  async function share() {
    setSharing(true);
    setShareError(null);
    try {
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(t, qr ?? '') });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Reçu ${t.receipt_number}`, UTI: 'com.adobe.pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e) {
      setShareError(e);
    } finally {
      setSharing(false);
    }
  }

  if (isLoading) return <Screen><Loading /></Screen>;
  if (error) return <Screen><ErrorBanner error={error} /></Screen>;

  return (
    <Screen>
      <Banner tone="ok" title={`${LABELS.txType[t.type]} enregistrée`}>Reçu n° {t.receipt_number}</Banner>
      <Card>
        <Title>{t.device.brand} {t.device.model}</Title>
        <Row label="IMEI 1" value={t.device.imei1} mono />
        {t.device.imei2 ? <Row label="IMEI 2" value={t.device.imei2} mono /> : null}
        <Row label="État" value={LABELS.condition[t.condition]} />
        <Row label="Montant" value={fcfa(t.price)} />
        <Row label="Date" value={dateTime(t.occurred_at)} />
        <Row label="Magasin" value={t.shop.name} />
        {t.person ? <Row label={t.type === 'sale' ? 'Acheteur' : 'Vendeur'} value={t.person.full_name} /> : null}
        {t.person ? <Row label="Pièce" value={`${LABELS.docType[t.person.id_doc_type]} ${t.person.id_doc_number}`} /> : null}
        {t.supplier_name ? <Row label="Fournisseur" value={t.supplier_name} /> : null}
      </Card>

      {t.type === 'sale' ? (
        <Card style={{ alignItems: 'center' }}>
          {qr ? <SvgXml xml={qr} width={200} height={200} accessibilityLabel="QR code du certificat de propriété" /> : <Loading />}
          <Muted style={{ textAlign: 'center' }}>Certificat de propriété : le client garde la preuve de son achat, même s’il perd le carton.</Muted>
        </Card>
      ) : null}

      <ErrorBanner error={shareError} />
      <Button title="Partager le reçu (PDF)" onPress={share} loading={sharing} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button title="Nouvelle opération" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace({ pathname: '/operation', params: { type: t.type } })} />
        <Button title="Accueil" variant="secondary" style={{ flex: 1 }} onPress={() => router.dismissTo('/home')} />
      </View>
    </Screen>
  );
}
