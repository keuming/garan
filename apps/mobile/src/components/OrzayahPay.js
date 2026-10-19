import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Text } from 'react-native';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Screen, Select, Title } from './ui';
import { ProtectedHero } from './ProtectedHero';
import { colors } from '../lib/theme';

const OPERATORS = [
  { value: 'ORANGE', label: 'Orange Money' },
  { value: 'MTN', label: 'MTN MoMo' },
  { value: 'MOOV', label: 'Moov Money' },
  { value: 'WAVE', label: 'Wave' }
];

/**
 * Paiement ORZAYAH.
 * mode 'link' (défaut) : le payeur est redirigé vers la page sécurisée pay.orzayah.com
 *   (Mobile Money, carte...) puis cet écran suit le paiement jusqu'à confirmation.
 * mode 'deposit' : ancien parcours, push Mobile Money direct (opérateur + numéro).
 * `onStart(body)` initie et renvoie { payment_id, status, payment_url?, next_action? }.
 * `onPoll(payment_id)` renvoie l'état ; on sonde jusqu'à un statut final.
 * `onSuccess(result)` est appelé une fois le paiement confirmé.
 */
export function OrzayahPay({ title, sub, amountLabel, onStart, onPoll, onSuccess, mode = 'link' }) {
  const [operator, setOperator] = useState('ORANGE');
  const [number, setNumber] = useState('');
  const [phase, setPhase] = useState('form'); // form | pending | done | failed
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [payUrl, setPayUrl] = useState(null);
  const timer = useRef(null);
  const paymentId = useRef(null);
  const phaseRef = useRef('form');

  const go = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // Au retour dans l'application (après la page de paiement), on relit tout de suite le statut.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && phaseRef.current === 'pending' && paymentId.current) {
        clearTimeout(timer.current);
        poll();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function statusOf(r) {
    return r?.deposit_status ?? r?.status ?? null;
  }

  async function poll() {
    try {
      const r = await onPoll(paymentId.current);
      const s = statusOf(r);
      setInfo(r);
      if (r?.status === 'SUCCESS' || r?.applied || s === 'SUCCESS' || r?.status === 'settled') {
        go('done');
        onSuccess?.(r);
        return;
      }
      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(s) || r?.status === 'failed') {
        go('failed');
        setError(new Error(r?.failure_reason || 'Paiement non abouti. Réessayez.'));
        return;
      }
      timer.current = setTimeout(poll, 4000); // toujours en attente de confirmation
    } catch (e) {
      timer.current = setTimeout(poll, 5000); // relecture impossible : on réessaie
    }
  }

  async function pay() {
    setError(null);
    go('pending');
    try {
      const r = await onStart(mode === 'link' ? {} : { operator, account_number: number });
      paymentId.current = r.payment_id;
      setInfo(r);
      const url = r.payment_url ?? r.next_action?.url ?? null;
      setPayUrl(url);
      if (url) Linking.openURL(url).catch(() => {});
      timer.current = setTimeout(poll, 3500);
    } catch (e) {
      go('form');
      setError(e);
    }
  }

  const ready = mode === 'link' ? true : /^\d{8,15}$/.test(number);

  return (
    <Screen>
      <Title sub={sub}>{title}</Title>
      <Card style={{ backgroundColor: colors.green, alignItems: 'center', gap: 2 }}>
        <Text style={{ color: '#042f1f', fontWeight: '800', fontSize: 13, textTransform: 'uppercase' }}>Montant</Text>
        <Text style={{ color: '#042a1c', fontSize: 30, fontWeight: '900' }}>{amountLabel}</Text>
      </Card>

      {phase === 'form' || phase === 'failed' ? (
        <Card>
          {mode === 'link' ? (
            <>
              <Muted>Paiement sécurisé ORZAYAH</Muted>
              <ErrorBanner error={error} />
              <Button title="Payer maintenant" onPress={pay} />
              <Muted>Vous serez redirigé vers la page de paiement ORZAYAH (Mobile Money, carte…). Revenez ensuite sur cet écran : il se met à jour automatiquement.</Muted>
            </>
          ) : (
            <>
              <Muted>Payer par Mobile Money</Muted>
              <Select label="Opérateur" value={operator} options={OPERATORS} onChange={setOperator} />
              <Input label="Numéro Mobile Money à débiter" value={number} onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 15))} keyboardType="phone-pad" placeholder="Ex. 0700000000" />
              <ErrorBanner error={error} />
              <Button title="Payer maintenant" onPress={pay} disabled={!ready} />
              <Muted>Vous recevrez une demande de confirmation sur ce numéro (code USSD / notification). Validez-la pour finaliser.</Muted>
            </>
          )}
        </Card>
      ) : null}

      {phase === 'pending' ? (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <Banner tone="info" title="En attente de votre paiement">
            {info?.next_action?.message || 'Finalisez le paiement. Cet écran se met à jour automatiquement.'}
          </Banner>
          {payUrl ? <Button title="Ouvrir la page de paiement" onPress={() => Linking.openURL(payUrl).catch(() => {})} /> : null}
          <Muted>Ne fermez pas cette page…</Muted>
        </Card>
      ) : null}

      {phase === 'done' ? (
        <>
          <ProtectedHero
            tone="protected"
            eyebrow="Paiement confirmé ✓"
            title="Vous êtes protégé"
            subtitle="Votre abonnement gaRAN est actif. Merci pour votre confiance."
          />
          <Button title="Continuer" onPress={() => onSuccess?.(info, true)} />
        </>
      ) : null}
    </Screen>
  );
}
