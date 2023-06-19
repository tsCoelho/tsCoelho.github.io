import React from 'react';
import RecipeList from './RecipeList';
import AudioRecorder from './AudioRecorder';
import './RecipeList.css'


import pasta from './delicious_pasta.jpg'; // Tell webpack this JS file uses this image

console.log(pasta); // /delicious_pasta.jpg
const App = () => {
  const recipes = [
    {
      title: 'Delicious Pasta',
      image: '/src/delicious_pasta.jpg',
      ingredients: ['Pasta', 'Tomato sauce', 'Parmesan cheese', 'Basil'],
      steps: ['Cook the pasta according to the package instructions.', 'Heat the tomato sauce in a pan.', 'Serve the pasta with sauce and sprinkle Parmesan cheese and basil on top.'],
      time: '30 minutes',
      inspirationSource: 'Example Cooking Blog',
    },
    {
      title: 'Yummy Pancakes',
      image: '/src/assets/yummy_pancakes.jpg',
      ingredients: ['Flour', 'Milk', 'Eggs', 'Sugar', 'Butter'],
      steps: ['In a bowl, mix the flour, milk, eggs, and sugar.', 'Heat butter in a pan.', 'Pour a ladle of batter into the pan and cook until bubbles form on the surface.', 'Flip the pancake and cook the other side until golden brown.', 'Serve with your favorite toppings.'],
      time: '20 minutes',
      inspirationSource: 'Example Breakfast Recipes',
    },
  ];

  return (
    
    <div>
      <AudioRecorder />
      <RecipeList recipes={recipes} />
    </div>

  );
};

export default App;
