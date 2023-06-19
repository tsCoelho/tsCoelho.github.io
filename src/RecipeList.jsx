import React from 'react';
import RecipeCard from './RecipeCard';
import './RecipeList.css'

const RecipeList = ({ recipes }) => {
  return (
    <div className="recipe-list">
      {recipes.map((recipe, index) => (
        <RecipeCard key={index} {...recipe} />
      ))}
    </div>
  );
};

export default RecipeList;
