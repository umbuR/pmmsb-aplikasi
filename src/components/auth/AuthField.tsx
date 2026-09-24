import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, Check, type LucideIcon } from 'lucide-react'

type AuthFieldProps = {
  label: string
  icon: LucideIcon
  error?: string
  valid?: boolean
  helper?: string
  trailing?: ReactNode
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder' | 'className'>

/**
 * Kolom isian dengan label mengapung, ikon, dan status validasi langsung.
 * Label naik lewat varian `peer-placeholder-shown` sehingga tidak perlu state tambahan.
 */
export function AuthField({ label, icon: Icon, error, valid, helper, trailing, ...input }: AuthFieldProps) {
  const auto = useId()
  const id = input.id ?? auto
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined
  const ring = error
    ? 'border-rose-300 bg-rose-50/40 focus:border-rose-400 focus:ring-rose-100'
    : valid
      ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-100'
      : 'border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-emerald-100'

  return (
    <div>
      <div className="relative">
        <Icon
          aria-hidden
          className={`pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 transition-colors ${
            error ? 'text-rose-400' : 'text-slate-400'
          }`}
        />
        <input
          {...input}
          id={id}
          placeholder=" "
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`lg-autofill peer w-full rounded-xl border bg-white px-12 pt-6 pb-2 text-[14px] font-medium text-[#0f1f2e] outline-none transition-all duration-200 focus:ring-4 ${ring}`}
        />
        <label
          htmlFor={id}
          className={`lg-display pointer-events-none absolute left-12 top-2 text-[10.5px] font-bold tracking-[.1em] uppercase transition-all duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-[13.5px] peer-placeholder-shown:font-medium peer-placeholder-shown:tracking-normal peer-placeholder-shown:normal-case peer-placeholder-shown:text-slate-400 peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[10.5px] peer-focus:font-bold peer-focus:tracking-[.1em] peer-focus:uppercase ${
            error ? 'text-rose-500 peer-focus:text-rose-500' : 'text-slate-500 peer-focus:text-emerald-600'
          }`}
        >
          {label}
        </label>
        <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {valid && !error && !trailing ? (
            <Check aria-hidden className="h-[18px] w-[18px] text-emerald-500" />
          ) : null}
          {trailing}
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[11.5px] font-medium text-rose-600">
          <AlertCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="mt-1.5 text-[11.5px] text-slate-400">
          {helper}
        </p>
      ) : null}
    </div>
  )
}
