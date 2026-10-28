import type {AdvisorChatSnapshot} from './model-advisor-chat';
import './model-advisor.css';

/** Plain React text nodes only: model output cannot create HTML, controls or game commands. */
export function AdvisorChatMessages({messages,pendingQuestion,notice}:AdvisorChatSnapshot){
  return <>{messages.map(message=><div key={message.id}>
    <p className="btl-question">{message.question}</p>
    <article data-testid="advisor-answer" data-source={message.answer.source} data-advisor-source={message.answer.source}>
      <small className="btl-advisor-source">{message.answer.source==='model'?'阿策 · 模型建议':'阿策 · 本地规则'}</small>
      <strong>{message.answer.title}</strong><p>{message.answer.text}</p>
    </article>
  </div>)}
  {pendingQuestion&&<div data-testid="advisor-loading"><p className="btl-question">{pendingQuestion}</p><p className="btl-advisor-status" role="status" data-testid="advisor-status">阿策正在观察战况……</p></div>}
  {notice&&<p className="btl-advisor-notice" role="status" data-testid="advisor-notice">{notice}</p>}
  </>;
}
