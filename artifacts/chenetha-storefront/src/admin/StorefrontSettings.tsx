import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetStorefrontSettingsQueryKey,
  useGetStorefrontSettings,
  useUpdateStorefrontSettings,
} from "@workspace/api-client-react";
import { ArrowRight, Check, LoaderCircle, RefreshCw } from "lucide-react";
import { AdminLayout } from "./Admin";

const MIN_RETURN_DAYS = 0;
const MAX_RETURN_DAYS = 2_147_483_647;

function returnBannerLabel(value: string) {
  if (value === "0") return "No returns";
  if (value === "1") return "1-day return";
  if (/^\d+$/.test(value)) return `${value}-day returns`;
  return "Choose a return window";
}

export function StorefrontReturnSettingsForm() {
  const queryClient = useQueryClient();
  const settings = useGetStorefrontSettings();
  const updateSettings = useUpdateStorefrontSettings();
  const [days, setDays] = useState("4");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (settings.data) setDays(String(settings.data.returnWindowDays));
  }, [settings.data?.returnWindowDays]);

  const save = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaved("");
    const returnWindowDays = Number(days);
    if (!Number.isInteger(returnWindowDays) || returnWindowDays < MIN_RETURN_DAYS || returnWindowDays > MAX_RETURN_DAYS) {
      setError("Enter a non-negative whole number of days.");
      return;
    }

    updateSettings.mutate({ data: { returnWindowDays } }, {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetStorefrontSettingsQueryKey(), result);
        setSaved("Return window saved and the storefront was updated.");
      },
      onError: (reason) => setError(reason instanceof Error ? reason.message : "The return window could not be saved."),
    });
  };

  if (settings.isLoading) {
    return <div className="admin-state" role="status"><LoaderCircle className="spin" size={18}/> Loading store settings…</div>;
  }

  if (settings.isError) {
    return <div className="admin-state" role="alert"><div><b>Store settings could not be loaded.</b><p>{settings.error instanceof Error ? settings.error.message : "Try again."}</p></div><button type="button" className="button button-quiet" onClick={() => void settings.refetch()}><RefreshCw size={14}/> Retry</button></div>;
  }

  return <section className="store-policy-card" data-testid="panel-store-return-settings">
    <div>
      <span className="eyebrow">RETURNS &amp; TRUST BANNER</span>
      <h2>Set the return window</h2>
      <p>Choose how many days after delivery a shopper may request a return. This updates the product banner and Customer Care answer.</p>
    </div>
    <form className="admin-form store-policy-form" onSubmit={save} data-testid="form-store-return-settings">
      <label htmlFor="input-return-window-days">Return window in days
        <input
          id="input-return-window-days"
          data-testid="input-return-window-days"
          type="number"
          min={MIN_RETURN_DAYS}
          max={MAX_RETURN_DAYS}
          step={1}
          required
          value={days}
          onChange={(event) => { setDays(event.target.value); setError(""); setSaved(""); }}
        />
      </label>
       <p className="field-note">Enter the return window that fits your policy. Use 0 when returns are not offered.</p>
      <div className="store-policy-preview" data-testid="text-return-banner-preview">
        <span>Product banner preview</span>
        <strong>{returnBannerLabel(days)} · Quality checked · Secure payments</strong>
      </div>
      {error && <p className="form-error" role="alert" data-testid="text-return-settings-error">{error}</p>}
      {saved && <p className="store-policy-saved" role="status" data-testid="text-return-settings-saved"><Check size={15}/>{saved}</p>}
      <button className="button button-primary" type="submit" disabled={updateSettings.isPending} data-testid="button-save-return-window">
        {updateSettings.isPending ? <LoaderCircle size={15} className="spin"/> : <ArrowRight size={15}/>}
        {updateSettings.isPending ? "Saving…" : "Save return window"}
      </button>
    </form>
  </section>;
}

export function AdminSettings() {
  return <AdminLayout title="Store settings" eyebrow="YOUR STOREFRONT">
    <StorefrontReturnSettingsForm/>
  </AdminLayout>;
}
