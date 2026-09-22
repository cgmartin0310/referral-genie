const STEPS = [
  { n: 1, label: 'Add clinic' },
  { n: 2, label: 'Pick counties' },
  { n: 3, label: 'Pull referral sources' },
  { n: 4, label: 'Enrich with Google Places' },
  { n: 5, label: 'Research missing info' },
];

export default function SetupSteps({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {STEPS.map((step) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <li
            key={step.n}
            className={`rounded-lg border px-3 py-2 ${
              active
                ? 'border-indigo-300 bg-indigo-50'
                : done
                  ? 'border-green-200 bg-green-50'
                  : 'border-gray-200 bg-white'
            }`}
          >
            <p className={`text-xs font-medium ${active ? 'text-indigo-700' : done ? 'text-green-700' : 'text-gray-500'}`}>
              Step {step.n}
            </p>
            <p className={`text-sm font-semibold ${active ? 'text-indigo-900' : 'text-gray-900'}`}>{step.label}</p>
          </li>
        );
      })}
    </ol>
  );
}
