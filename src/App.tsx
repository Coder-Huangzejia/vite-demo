import React from 'react';
import LargeImage from '@/assets/1MB.jpg'
import SmallImage from '@/assets/14KB.jpg'
import MiddleKB from '@/assets/478KB.jpg'

function App() {
  const [count] = React.useState(0)
  return (
    <>
     {count}
     <img src={LargeImage}/>
     <img src={SmallImage}/>
     <img src={MiddleKB}/>
    </>
  )
}

export default App
