import { Toasts, TopBar } from './components/bits';
import { useRoute, navigate } from './lib/router';
import { Home } from './screens/Home';
import { Nebula } from './screens/Nebula';
import { Room } from './screens/Room';
import { WorldPage } from './screens/WorldPage';

export function App() {
  const route = useRoute();
  return (
    <>
      {route.name === 'home' ? <Home /> : null}
      {route.name === 'room' ? <Room code={route.code} /> : null}
      {route.name === 'nebula' ? <Nebula /> : null}
      {route.name === 'world' ? <WorldPage id={route.id} /> : null}
      {route.name === 'notFound' ? (
        <div className="page">
          <TopBar crumb="길을 잃었어요" />
          <p className="muted">찾는 화면이 없어요.</p>
          <button type="button" className="btn btn--accent" onClick={() => navigate('/')}>
            처음으로
          </button>
        </div>
      ) : null}
      <Toasts />
    </>
  );
}
