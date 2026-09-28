import { currentMember, forms, words } from "../../../../lib/session.ts";
import { number, when } from "../../labels.ts";
import { loadForm } from "../../load.ts";

// The page shows the latest answers; the export holds them all.
const shown = 200;

export default async function Responses({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await loadForm(id);
  const { responses } = await forms.responses(await currentMember(), form.id, shown);
  const t = await words();
  return (
    <main>
      <p className="small"><a href={"/chest/" + form.id}>{form.title}</a></p>
      <div className="lead">
        <div>
          <h1>{t.responses.title}</h1>
          <p>{t.count(form.responses)}{form.responses > shown ? t.responses.latest(shown) : ""}</p>
        </div>
        {form.responses > 0 && <a className="button quiet" href={"/chest/" + form.id + "/responses.csv"} download>{t.responses.export}</a>}
      </div>
      {responses.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t.responses.number}</th>
                <th scope="col">{t.responses.received}</th>
                {form.fields.map(field => <th scope="col" key={field.id}>{field.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {responses.map((response, i) => (
                <tr key={response.id}>
                  <td className="small">{number(form.responses - 1 - i)}</td>
                  <td className="small">{when(response.at, t.dateLocale)}</td>
                  {form.fields.map(field => <td key={field.id}>{response.answers[field.id]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
