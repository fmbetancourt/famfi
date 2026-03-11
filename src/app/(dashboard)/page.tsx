import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DebtSummaryCard } from "@/components/dashboard/debt-summary-card";
import { UpcomingPaymentsCard } from "@/components/dashboard/upcoming-payments-card";
import { DebtDistributionChart } from "@/components/dashboard/debt-distribution-chart";
import { MonthlyBudgetCard } from "@/components/dashboard/monthly-budget-card";

// Hardcoded data from financial-context.md — will connect to DB next session
const TOTAL_DEBT = 40_476_064;
const TOTAL_LIMIT = 110_188_000;
const CARD_COUNT = 13;

const DEBT_DISTRIBUTION = [
  { name: "Scotiabank Signature", value: 14_637_492, color: "#EF4444" },
  { name: "Santander World Ltd", value: 14_388_382, color: "#F97316" },
  { name: "Scotiabank Infinite", value: 6_575_620, color: "#EAB308" },
  { name: "Santander Platinum", value: 3_795_017, color: "#84CC16" },
  { name: "Otras (5 tarjetas)", value: 1_079_553, color: "#94A3B8" },
];

function computePayments(): { bank: string; dueDay: number; daysLeft: number }[] {
  const today = new Date();
  const day = today.getDate();

  function daysUntil(dueDay: number): number {
    if (day <= dueDay) {
      return dueDay - day;
    }
    // Next month
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    const diffMs = nextMonth.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  return [
    { bank: "Santander", dueDay: 10, daysLeft: daysUntil(10) },
    { bank: "Scotiabank", dueDay: 11, daysLeft: daysUntil(11) },
    { bank: "Falabella / BCI / Ripley", dueDay: 10, daysLeft: daysUntil(10) },
  ];
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const firstName = session?.user?.name?.split(" ")[0] ?? "";
  const now = new Date();
  const currentMonth = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Hola, {firstName}</h1>
        <p className="text-sm text-muted-foreground">
          Resumen financiero familiar
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Full width on mobile, spans 2 cols on desktop */}
        <div className="md:col-span-2">
          <DebtSummaryCard
            totalDebt={TOTAL_DEBT}
            cardCount={CARD_COUNT}
            totalLimit={TOTAL_LIMIT}
          />
        </div>

        <UpcomingPaymentsCard payments={computePayments()} />

        <MonthlyBudgetCard
          planned={3_526_000}
          spent={0}
          month={currentMonth}
        />

        <div className="md:col-span-2">
          <DebtDistributionChart data={DEBT_DISTRIBUTION} />
        </div>
      </div>
    </div>
  );
}
