import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Share, View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Banner, Button, Card, ErrorBanner, Loading, Muted, Row, Screen, Title } from '../../../src/components/ui';
import { api } from '../../../src/lib/api';
import { dateTime, fcfa, LABELS } from '../../../src/lib/format';
import { code128Svg } from '../../../src/lib/barcode';
import { colors } from '../../../src/lib/theme';

const PAY = { cash: 'Espèces', orzayah: 'ORZAYAH (paiement digital)' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function receiptHtml(t, qrSvg, barcodeSvg) {
  const who = t.type === 'sale' ? 'Acheteur' : 'Vendeur';
  const rows = [
    ['Opération', LABELS.txType[t.type]],
    ['Date et heure', dateTime(t.occurred_at)],
    ['Téléphone', `${t.device.brand ?? ''} ${t.device.model ?? ''}`],
    ['IMEI 1', t.device.imei1],
    ...(t.device.imei2 ? [['IMEI 2', t.device.imei2]] : []),
    ['État', LABELS.condition[t.condition]],
    ['Montant', fcfa(t.price)],
    ...(t.payment_method ? [['Paiement', PAY[t.payment_method] ?? t.payment_method]] : []),
    ...(t.type === 'sale' && t.payment ? [['Statut du paiement', t.payment.paid ? 'Payé' : 'En attente de paiement']] : []),
    ...(t.person
      ? [[who, t.person.full_name], ['Pièce', `${LABELS.docType[t.person.id_doc_type] ?? t.person.id_doc_type} ${t.person.id_doc_number}`], ['Contacts', `${t.person.phone1} / ${t.person.phone2}`]]
      : []),
    ['Enregistré par', t.recorded_by]
  ];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0A1F44;padding:28px;font-size:13px}
    .brand{font-size:30px;letter-spacing:-1px}.ga{font-weight:500}.ran{font-weight:800;color:#00D27A}
    h1{font-size:18px;margin:14px 0 2px}.muted{color:#4A5878}
    .merchant{margin-top:10px;padding:12px 14px;background:#F4F7FC;border-radius:12px}
    .merchant strong{font-size:15px}
    table{width:100%;border-collapse:collapse;margin-top:14px}td{padding:7px 0;border-bottom:1px solid #E1E7F2}
    td:first-child{color:#4A5878;width:38%}td:last-child{font-weight:600}
    .barcode{margin-top:18px;text-align:center;border:1px solid #E1E7F2;border-radius:12px;padding:14px}
    .barcode .imei{font-family:monospace;font-size:16px;letter-spacing:2px;margin-top:6px}
    .qr{display:flex;gap:16px;align-items:center;margin-top:16px;border:1px solid #E1E7F2;border-radius:12px;padding:12px}
    .qr svg{width:120px;height:120px}
  </style></head><body>
  <div class="brand"><span class="ga">ga</span><span class="ran">RAN</span></div>
  <div class="muted">Registre digital des téléphones · IMEI</div>
  <h1>${t.type === 'sale' ? (t.payment?.paid === false ? 'Reçu de vente — paiement en attente' : 'Reçu d’encaissement et certificat de propriété') : `Reçu — ${esc(LABELS.txType[t.type])}`}</h1>
  <div class="muted">N° ${esc(t.receipt_number)}</div>
  <div class="merchant">
    <strong>${esc(t.organization?.name ?? t.shop.name)}</strong><br>
    ${esc(t.shop.name)} — ${esc(t.shop.city)}, ${esc(t.shop.district)}<br>
    ${esc(t.shop.phone)}${t.shop.rccm ? ` · RCCM ${esc(t.shop.rccm)}` : ''}
  </div>
  <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
  <div class="barcode">${barcodeSvg}<div class="imei">${esc(t.device.imei1)}</div></div>
  ${t.type === 'sale' ? `<div class="qr">${qrSvg}<div><strong>Preuve de propriété</strong><br><span class="muted">Scannez ce code ou ouvrez ${esc(t.certificate_url)} pour vérifier que ce téléphone vous appartient, même sans le carton.</span></div></div>` : ''}
  </body></html>`;
}

export default function Receipt() {
  const { id } = useLocalSearchParams();
  const { data: t, error, isLoading } = useQuery({ queryKey: ['transaction', id], queryFn: () => api.get(`/transactions/${id}`) });
  const qc = useQueryClient();
  const [qr, setQr] = useState(null);
  const [payQr, setPayQr] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(null);

  useEffect(() => {
    if (t?.certificate_url) QRCode.toString(t.certificate_url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null));
  }, [t?.certificate_url]);

  // Encaissement ORZAYAH : lien de paiement + suivi automatique jusqu'à confirmation.
  const isOz = t?.type === 'sale' && t?.payment_method === 'orzayah';
  const payQ = useQuery({
    queryKey: ['sale-payment', id],
    queryFn: () => api.get(`/transactions/${id}/payment`),
    enabled: Boolean(isOz),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 4000 : false)
  });
  const pay = isOz ? (payQ.data ?? t.payment) : t?.payment;
  const start = useMutation({
    mutationFn: () => api.post(`/transactions/${id}/payment`),
    onSuccess: (r) => qc.setQueryData(['sale-payment', id], r)
  });
  useEffect(() => {
    if (pay?.paid && isOz) {
      qc.invalidateQueries({ queryKey: ['transaction', id] });
      qc.invalidateQueries({ queryKey: ['balance'] });
    }
  }, [pay?.paid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pay?.payment_url) QRCode.toString(pay.payment_url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setPayQr).catch(() => setPayQr(null));
    else setPayQr(null);
  }, [pay?.payment_url]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (stt) => { if (stt === 'active' && isOz) payQ.refetch(); });
    return () => sub.remove();
  }, [isOz]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sharePayLink() {
    if (!pay?.payment_url) return;
    await Share.share({
      message: `Paiement de ${fcfa(t.price)} à ${t.organization?.name ?? t.shop.name} (reçu ${t.receipt_number}) — payez en toute sécurité avec ORZAYAH :\n${pay.payment_url}`,
      url: pay.payment_url
    });
  }

  const barcode = t ? code128Svg(t.device.imei1, { height: 64, scale: 1.7 }) : null;

  async function share() {
    setSharing(true);
    setShareError(null);
    try {
      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (w) { w.document.write(receiptHtml({ ...t, payment: pay }, qr ?? '', barcode ?? '')); w.document.close(); w.focus(); w.print(); }
        setSharing(false);
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: receiptHtml({ ...t, payment: pay }, qr ?? '', barcode ?? '') });
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

      <Card style={{ alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{t.organization?.name ?? t.shop.name}</Text>
        <Muted>{t.shop.name} · {t.shop.city}, {t.shop.district}</Muted>
        <Muted>{t.shop.phone}{t.shop.rccm ? ` · RCCM ${t.shop.rccm}` : ''}</Muted>
      </Card>

      <Card>
        <Title>{t.device.brand} {t.device.model}</Title>
        <Row label="État" value={LABELS.condition[t.condition]} />
        <Row label="Montant" value={fcfa(t.price)} />
        {t.payment_method ? <Row label="Paiement" value={PAY[t.payment_method] ?? t.payment_method} /> : null}
        <Row label="Date et heure" value={dateTime(t.occurred_at)} />
        {t.person ? <Row label={t.type === 'sale' ? 'Acheteur' : 'Vendeur'} value={t.person.full_name} /> : null}
        {t.person ? <Row label="Pièce" value={`${LABELS.docType[t.person.id_doc_type]} ${t.person.id_doc_number}`} /> : null}
        {t.supplier_name ? <Row label="Fournisseur" value={t.supplier_name} /> : null}
      </Card>

      <Card style={{ alignItems: 'center', gap: 8 }}>
        <Muted>IMEI du téléphone</Muted>
        {barcode ? <SvgXml xml={barcode} width="100%" height={64} accessibilityLabel={`Code-barres IMEI ${t.device.imei1}`} /> : null}
        <Text style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: 2, color: colors.ink }}>{t.device.imei1}</Text>
        {t.device.imei2 ? <Text style={{ fontFamily: 'monospace', fontSize: 13, color: colors.ink2 }}>IMEI 2 : {t.device.imei2}</Text> : null}
      </Card>

      {t.type === 'sale' ? (
        <Card style={{ alignItems: 'center' }}>
          {qr ? <SvgXml xml={qr} width={180} height={180} accessibilityLabel="QR code du certificat de propriété" /> : <Loading />}
          <Muted style={{ textAlign: 'center' }}>Certificat de propriété : le client garde la preuve de son achat, même s’il perd le carton.</Muted>
        </Card>
      ) : null}

      {isOz ? (
        pay?.paid ? (
          <Banner tone="ok" title="Paiement ORZAYAH encaissé ✓">Le montant de {fcfa(t.price)} est confirmé. Le reçu ci-dessous fait foi d’encaissement.</Banner>
        ) : (
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <Title>Encaissement ORZAYAH</Title>
            {pay?.status === 'pending' && pay.payment_url ? (
              <>
                {payQr ? <SvgXml xml={payQr} width={190} height={190} accessibilityLabel="QR code de paiement ORZAYAH" /> : <Loading />}
                <Muted style={{ textAlign: 'center' }}>L’acheteur scanne ce code (ou ouvre le lien) et paie {fcfa(t.price)}. Cet écran se met à jour dès la confirmation.</Muted>
                <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
                  <Button title="Partager le lien" onPress={sharePayLink} style={{ flex: 1 }} />
                  <Button title="Ouvrir" variant="secondary" onPress={() => Linking.openURL(pay.payment_url).catch(() => {})} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <>
                <Muted style={{ textAlign: 'center' }}>
                  {pay?.status === 'failed' ? 'Le dernier paiement n’a pas abouti.' : 'Paiement ORZAYAH en attente.'} Générez le lien de {fcfa(t.price)} à faire régler par l’acheteur.
                </Muted>
                <ErrorBanner error={start.error} />
                <Button title="Générer le lien de paiement" onPress={() => start.mutate()} loading={start.isPending} style={{ alignSelf: 'stretch' }} />
              </>
            )}
          </Card>
        )
      ) : null}

      <ErrorBanner error={shareError} />
      <Button title="Partager le reçu (PDF)" onPress={share} loading={sharing} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Button title="Nouvelle vente" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace(t.type === 'sale' ? '/sale' : { pathname: '/operation', params: { type: t.type } })} />
        <Button title="Accueil" variant="secondary" style={{ flex: 1 }} onPress={() => router.dismissTo('/home')} />
      </View>
    </Screen>
  );
}
