import {useEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import type {Catalog, GameState} from '../../contracts';
import Modal from '../../ui/Modal';
import {AdvisorPortrait} from '../battle/shared/AdvisorPortrait';
import {AdvisorProvider, useGlobalAdvisor} from './AdvisorProvider';
import {homeAdvisorCopy} from './home-presentation';
import './home-advisor.css';

interface Props {
  state: GameState; catalog: Catalog; open: boolean; blocked: boolean; resetKey: string | number;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
}

/** The home's pause belongs to its modal. It must not block its own request. */
export default function HomeAdvisor(props: Props) {
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const blocked = props.blocked || hidden;
  useEffect(() => {if (props.open && blocked) props.onOpenChange(false);}, [props.open, blocked, props.onOpenChange]);
  return <AdvisorProvider state={props.state} catalog={props.catalog} open={props.open && !blocked}
    onOpenChange={props.onOpenChange} blocked={blocked} resetKey={props.resetKey}>
    {props.open && !blocked && <HomeAdvisorDialog state={props.state} catalog={props.catalog} onClose={() => props.onOpenChange(false)}/>}
  </AdvisorProvider>;
}

function HomeAdvisorDialog({state, catalog, onClose}: {state: GameState; catalog: Catalog; onClose: () => void}) {
  const advisor = useGlobalAdvisor();
  const copy = homeAdvisorCopy(state, catalog)!;
  const [question, setQuestion] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {if (log.current) log.current.scrollTop = log.current.scrollHeight;}, [advisor.messages, advisor.pendingQuestion, advisor.notice]);
  const ask = (value: string) => {if (advisor.ask(value)) setQuestion('');};
  return <Modal title="阿策 · 花房问答" className="home-advisor-dialog" onClose={onClose}>
    <header className="home-advisor-header"><div className="home-advisor-portrait"><AdvisorPortrait/></div>
      <div><small>A LITTLE TALK AT HOME</small><h2>和阿策聊聊</h2><p>{copy.subtitle}</p></div>
    </header>
    <div className="home-advisor-log" ref={log} role="log" aria-label="与阿策的对话" aria-live="polite" aria-relevant="additions text">
      <section className="home-advisor-welcome"><b>{copy.welcome}</b><p>{copy.context}</p></section>
      {!advisor.messages.length && !advisor.loading && <>
        <div className="home-advisor-prompts" aria-label="可以聊的话题">{copy.prompts.map(prompt =>
          <button key={prompt} type="button" disabled={!advisor.ready} onClick={() => ask(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>,
        )}</div>
        {!!copy.stories.length && <details className="home-advisor-stories"><summary>已经走过的旅程片段</summary>
          {copy.stories.map(story => <p key={story.id}><b>{story.title}</b>{story.text}</p>)}
        </details>}
      </>}
      {advisor.messages.map(message => <div className="home-advisor-exchange" key={message.id}>
        <p className="home-advisor-question">{message.question}</p>
        <article data-testid="home-advisor-answer" data-source={message.answer.source}>
          <small>{message.answer.source === 'model' ? copy.modelLabel : copy.localLabel}</small>
          <h3>{message.answer.title}</h3><p>{message.answer.text}</p>
          {message.answer.source === 'local' && <span className="home-advisor-local-note">{copy.localNotice}</span>}
        </article>
      </div>)}
      {advisor.loading && <div className="home-advisor-exchange"><p className="home-advisor-question">{advisor.pendingQuestion}</p>
        <p className="home-advisor-pending" role="status" data-testid="home-advisor-loading"><span aria-hidden="true">···</span>{copy.pending}</p>
      </div>}
      {advisor.notice && !advisor.loading && <p className="home-advisor-notice" role="status">{advisor.notice}</p>}
    </div>
    <form className="home-advisor-form" onSubmit={event => {event.preventDefault();ask(question);}}>
      <label className="visually-hidden" htmlFor="home-advisor-question">询问阿策</label>
      <textarea id="home-advisor-question" value={question} rows={2} maxLength={500} placeholder={copy.placeholder}
        disabled={advisor.loading || !advisor.ready} onChange={event => setQuestion(event.target.value)}
        onKeyDown={event => {if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault();ask(question);}}}/>
      <button type="submit" disabled={advisor.loading || !advisor.ready || !question.trim()}>问问阿策 <span aria-hidden="true">↗</span></button>
    </form>
    <footer className="home-advisor-footer"><span>阿策提供建议，行动由你决定</span><small>Enter 发送 · Shift + Enter 换行</small></footer>
  </Modal>;
}
